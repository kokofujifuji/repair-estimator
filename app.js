document.addEventListener('DOMContentLoaded', () => {
    // Amazon Affiliate ID (アソシエイトのトラッキングID)
    const AMAZON_AFFILIATE_TAG = 'kokofujifuji-22';

    // Nav logic
    const screens = {
        upload: document.getElementById('uploadScreen'),
        question: document.getElementById('questionScreen'),
        choice: document.getElementById('choiceScreen'),
        diy: document.getElementById('diyScreen'),
        pro: document.getElementById('proScreen')
    };

    function navigateTo(screenName) {
        Object.values(screens).forEach(s => {
            s.classList.remove('active');
            setTimeout(() => s.classList.add('hidden'), 300); // Wait for fade out
        });
        
        setTimeout(() => {
            Object.values(screens).forEach(s => s.classList.add('hidden'));
            screens[screenName].classList.remove('hidden');
            setTimeout(() => screens[screenName].classList.add('active'), 10); // Trigger fade in
        }, 300);
    }

    // Elements
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    const imagePreview = document.getElementById('imagePreview');
    const uploadContent = document.querySelector('.upload-content');
    const analyzeBtn = document.getElementById('analyzeBtn');
    const loadingIndicator = document.getElementById('loadingIndicator');

    // Routing Back Buttons
    document.querySelectorAll('.back-btn').forEach(btn => {
        btn.addEventListener('click', () => navigateTo('choice'));
    });

    // Routing Choices
    document.getElementById('btnGoDiy').addEventListener('click', () => navigateTo('diy'));
    document.getElementById('btnGoPro').addEventListener('click', () => navigateTo('pro'));

    let currentFile = null;

    // --- UPLOAD LOGIC ---
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
    dropZone.addEventListener('dragleave', () => { dropZone.classList.remove('dragover'); });
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault(); dropZone.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) handleFile(e.dataTransfer.files[0]);
    });
    dropZone.addEventListener('click', (e) => {
        if (!currentFile && e.target !== analyzeBtn) fileInput.click();
    });
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) handleFile(e.target.files[0]);
    });

    function handleFile(file) {
        if (!file.type.startsWith('image/')) {
            alert('画像を選択してください。');
            return;
        }
        currentFile = file;
        const reader = new FileReader();
        reader.onload = (e) => {
            imagePreview.src = e.target.result;
            imagePreview.classList.remove('hidden');
            uploadContent.classList.add('hidden');
            analyzeBtn.classList.remove('hidden');
            dropZone.style.borderStyle = 'solid';
        };
        reader.readAsDataURL(file);
    }

    let currentQuestions = [];
    
    // --- ANALYSIS LOGIC ---
    analyzeBtn.addEventListener('click', async (e) => {
        e.stopPropagation();

        analyzeBtn.classList.add('hidden');
        loadingIndicator.classList.remove('hidden');

        try {
            await askQuestions(currentFile);
        } catch (err) {
            console.error(err);
            alert('エラーが発生しました: ' + err.message);
            analyzeBtn.classList.remove('hidden');
        } finally {
            loadingIndicator.classList.add('hidden');
        }
    });

    async function askQuestions(file) {
        const base64Data = imagePreview.src.split(',')[1];
        const promptText = `あなたは日本の経験豊富なリフォーム現場監督です。この画像の修繕見積もり（プロへの依頼費とDIY費の実勢価格計算）を行うにあたり、画像だけでは判断が難しい「材質」「傷の深さ」「建物の種類」など、依頼者に確認すべき事柄を最大3つまで質問してください。
        
        以下のJSON形式のみで出力してください。（Markdown修飾やJSON以外のテキストは絶対に含めないでください）
        {
            "questions": ["確認事項1", "確認事項2"]
        }
        
        ※画像だけで十分に判断できる場合は空の配列 [] を返してください。`;

        const reqBody = { promptText, mimeType: file.type, base64Data };

        const response = await fetch(`/api/analyze`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(reqBody)
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error('API呼び出し失敗(' + response.status + '): ' + errText);
        }
        const data = await response.json();
        const textOutput = data.candidates[0].content.parts[0].text;
        const resultJSON = JSON.parse(textOutput.replace(/```json/gi, '').replace(/```/g, '').trim());

        if (resultJSON.questions && resultJSON.questions.length > 0) {
            currentQuestions = resultJSON.questions;
            const ul = document.getElementById('aiQuestionList');
            ul.innerHTML = '';
            currentQuestions.forEach(q => {
                const li = document.createElement('li');
                li.style.marginBottom = "0.5rem";
                li.textContent = q;
                ul.appendChild(li);
            });
            navigateTo('question');
        } else {
            // 質問がない場合は即座にフェーズ2へ
            navigateTo('question');
            document.getElementById('loadingIndicator2').classList.remove('hidden');
            await generateFinalEstimation(file, "特になし");
        }
    }

    // --- PHASE 2 CONTROLS ---
    document.getElementById('submitAnswerBtn').addEventListener('click', async () => await proceedToFinal(document.getElementById('userAnswerInput').value));
    document.getElementById('skipAnswerBtn').addEventListener('click', async () => await proceedToFinal("わからない"));

    async function proceedToFinal(userAnswer) {
        document.getElementById('submitAnswerBtn').disabled = true;
        document.getElementById('skipAnswerBtn').disabled = true;
        document.getElementById('loadingIndicator2').classList.remove('hidden');
        
        try {
            await generateFinalEstimation(currentFile, userAnswer);
        } catch(err) {
            console.error(err);
            alert('エラー: ' + err.message);
            document.getElementById('submitAnswerBtn').disabled = false;
            document.getElementById('skipAnswerBtn').disabled = false;
        } finally {
            document.getElementById('loadingIndicator2').classList.add('hidden');
        }
    }

    async function generateFinalEstimation(file, userAnswer) {
        const base64Data = imagePreview.src.split(',')[1];
        const promptText = `
        あなたは日本の経験豊富なリフォーム会社の現場監督です。この画像と、依頼者へのヒアリング結果を詳細に分析し、日本の市場価格に基づいた修繕見積もりを作成してください。
        
        【AIからの事前質問とユーザーの回答】
        質問: ${currentQuestions.join(' / ')}
        依頼者の回答: ${userAnswer || "なし"}
        ※「わからない」等の回答の場合は、画像から推測できる最悪のケースと軽微なケースの平均をとるなど、プロとして論理的に安全な推測を行ってください。
        
        【前提となる相場データ】
        - 職人の人件費（※重要：基本相場をあらかじめ1.25倍したバッファ込みの金額を適用すること）: 1日あたり 31,250円〜43,750円。半日作業は 18,750円〜。
        - 諸経費（出張費・車両・廃材処分）: 小規模工事で5,000円〜10,000円。
        - 壁紙（クロス）張替: 材料費・施工費を合わせて1平米1,500円〜。（※当プラットフォームは依頼主と職人を「直接繋ぐ」ため、元請け業者が設定するような「最低請負金額（一律2万円など）」は【絶対に適用しない】でください。小さな傷なら「純粋な平米単価 × 小面積 ＋ 職人の人件費」で適正価格を算出してください）
        - 石膏ボード修復: 部分補修＋クロス張替で25,000円〜50,000円（材料費含む）。
        - フローリング補修: 小さなリペア補修で1箇所 15,000円〜30,000円。
        - 室内ドアの穴: 表面シート補修で30,000円〜。
        
        【出力時の厳格な表現ルール】
        ・ 見出しにはMarkdownの「#」を絶対使わないでください。メインの見出しは必ず「・プロに依頼する場合」「・DIYの場合」という完全一致の文字列を使用し、その他の小見出しも「・」を使用してください。
        ・ リストの箇条書きには「*」や「-」ではなく「・」を使用してください。
        ・ アウトプット内で「相場データによると」「相場データの〇〇〜を適用」といった、システムプロンプトの存在を暴露するような言い回しは一切禁止です。断定系（例：職人人工（半日）: 18,750円）で自然な文章として記載してください。
        
        【分析プロセス】
        1. 画像と回答から損傷の種類、深さ、およその大きさを厳密に推定する。
        2. 直すための具体的な工法（部分補修で済むか、全面張替えか）を決定する。
        3. プロ施工費用を「材料費 ＋ 人件費（1.25倍計算済み） ＋ 諸経費」で算出し、pro_costとする。
        4. DIY材料費をAmazon実売価格ベースで算出し、diy_costとする。
        
        上記を踏まえ、以下のJSON形式のみで出力してください。（Markdown修飾やJSON以外のテキストは絶対に含めないでください。※JSONパースエラーを防ぐため、文字列内で生の改行は絶対に行わず、改行したい箇所には必ず「\\n」という文字をご記入ください）
        {
            "damage_type": "損傷の種類（例：壁紙のキズ、石膏ボードの大きな穴など）",
            "severity": "low, medium, high のいずれか",
            "description": "具体的な状況や注意点などを、素人にも分かりやすく解説（※手順は下のdiy_stepsに書くためここには書かないでください）",
            "calculation_logic": "コスト算出の論理的根拠（こちらも適宜 \\n を入れて読みやすくする）",
            "pro_cost": プロに依頼した場合の想定額数値（プロの施工費用の最終合計, 例: 35000。数値のみ）,
            "diy_cost": DIYで直す場合の想定材料費合計数値（例: 4500。数値のみ）,
            "materials": [
                { "name": "材料・道具名", "is_must": true または false (必須ならtrue、あれば便利程度ならfalse), "estimated_price": 価格の数値, "search_term": "Amazonでの検索キーワード(日本語)" }
            ],
            "diy_steps": [
                "手順1の具体的な説明を書く（例：まずは◯◯を行って汚れを落とします）",
                "手順2の具体的な説明を書く",
                "手順3の具体的な説明を書く"
            ]
        }`;

        const reqBody = { promptText, mimeType: file.type, base64Data };

        const response = await fetch(`/api/analyze`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(reqBody)
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error('API呼び出し失敗(' + response.status + '): ' + errText);
        }
        const data = await response.json();
        const textOutput = data.candidates[0].content.parts[0].text;
        const cleanedText = textOutput.replace(/```json/gi, '').replace(/```/g, '').trim();
        const resultJSON = JSON.parse(cleanedText);

        populateUI(resultJSON);
        navigateTo('choice');
    }

    // --- POPULATE SCREENS ---
    function populateUI(res) {
        // Choice Screen Summary
        document.getElementById('sumType').textContent = res.damage_type;
        document.getElementById('sumDesc').textContent = res.description;
        
        if (document.getElementById('sumLogic')) {
            let logicText = res.calculation_logic || "推測に基づく概算です";
            logicText = logicText.replace(/</g, "&lt;").replace(/>/g, "&gt;");
            
            const costStrPro = typeof res.pro_cost === 'number' ? res.pro_cost.toLocaleString() : res.pro_cost;
            const costStrDiy = typeof res.diy_cost === 'number' ? res.diy_cost.toLocaleString() : res.diy_cost;
            
            // 見出しの行末までマッチさせて上書きし、計算済みの合計金額を強制的に付与する
            logicText = logicText.replace(/(◆|・)?プロに依頼する場(合の.*?算出|合).*/g, `<strong style="font-size: 1.2rem; display: block; margin-top: 1.5rem; margin-bottom: 0.5rem; color: #1e3a8a; border-bottom: 2px solid #bfdbfe; padding-bottom: 4px;">・プロに依頼する場合: ${costStrPro} 円</strong>`);
            
            logicText = logicText.replace(/(◆|・)?DIYの場(合の.*?算出|合).*/g, `<strong style="font-size: 1.2rem; display: block; margin-top: 1.5rem; margin-bottom: 0.5rem; color: #047857; border-bottom: 2px solid #a7f3d0; padding-bottom: 4px;">・DIYの場合: ${costStrDiy} 円</strong>`);
            
            document.getElementById('sumLogic').innerHTML = logicText;
        }
        
        const severityEl = document.getElementById('sumSeverity');
        severityEl.setAttribute('data-level', res.severity.toLowerCase());
        const severityMap = { 'high': '重度', 'medium': '中度', 'low': '軽度' };
        severityEl.textContent = severityMap[res.severity.toLowerCase()] || res.severity;

        document.getElementById('sumDiyCost').textContent = typeof res.diy_cost === 'number' ? `¥${res.diy_cost.toLocaleString()}` : `¥${res.diy_cost}`;
        document.getElementById('sumProCost').textContent = typeof res.pro_cost === 'number' ? `¥${res.pro_cost.toLocaleString()}` : `¥${res.pro_cost}`;

        // DIY Screen
        document.getElementById('diyTotalCost').textContent = document.getElementById('sumDiyCost').textContent;
        const materialsContainer = document.getElementById('resMaterials');
        materialsContainer.innerHTML = '';
        
        if (Array.isArray(res.materials)) {
            // 必須アイテムを上にソート
            res.materials.sort((a, b) => (b.is_must === true ? 1 : 0) - (a.is_must === true ? 1 : 0));
            
            res.materials.forEach(mat => {
                const price = typeof mat.estimated_price === 'number' ? mat.estimated_price.toLocaleString() : mat.estimated_price;
                const li = document.createElement('li');
                li.className = 'material-item';
                
                const isMust = mat.is_must !== false;
                const badgeHtml = isMust 
                    ? '<span style="background: #fee2e2; color: #ef4444; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: bold; margin-left: 0.5rem; border: 1px solid #fca5a5;">必須</span>'
                    : '<span style="background: #f8fafc; color: #64748b; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: bold; margin-left: 0.5rem; border: 1px solid #cbd5e1;">あれば便利</span>';
                
                if (isMust) {
                    li.style.borderLeft = "4px solid #ef4444";
                    li.style.background = "linear-gradient(to right, rgba(239,68,68,0.05), transparent)";
                } else {
                    li.style.borderLeft = "4px solid #cbd5e1";
                    li.style.opacity = "0.85";
                }
                
                li.style.paddingLeft = "1rem";
                
                li.innerHTML = `
                    <div class="mat-details">
                        <div style="display: flex; align-items: center; margin-bottom: 0.25rem;">
                            <strong style="font-size: 1.05rem;">${mat.name}</strong>
                            ${badgeHtml}
                        </div>
                        <div style="color: #64748b;">想定価格: 約 ¥${price}</div>
                    </div>
                    <a href="https://www.amazon.co.jp/s?k=${encodeURIComponent(mat.search_term)}&tag=${AMAZON_AFFILIATE_TAG}" target="_blank" class="material-link">
                        Amazonで購入 <i data-lucide="external-link" style="width:16px; height:16px;"></i>
                    </a>
                `;
                materialsContainer.appendChild(li);
            });
        }

        // DIY Steps Injection
        const stepsContainer = document.getElementById('diyStepsContainer');
        if (stepsContainer) {
            stepsContainer.innerHTML = '';
            if (Array.isArray(res.diy_steps) && res.diy_steps.length > 0) {
                res.diy_steps.forEach((stepText, index) => {
                    const stepDiv = document.createElement('div');
                    stepDiv.style.cssText = "display: flex; gap: 1rem; background: #f8fafc; padding: 1.25rem; border-radius: 8px; border-left: 4px solid #3b82f6;";
                    stepDiv.innerHTML = `
                        <div style="flex-shrink: 0; display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; background: #3b82f6; color: white; font-weight: bold; border-radius: 50%; font-size: 1.1rem; box-shadow: 0 4px 6px -1px rgba(59, 130, 246, 0.3);">${index + 1}</div>
                        <div style="flex-grow: 1; color: #334155; line-height: 1.6; font-size: 1.05rem;">${stepText}</div>
                    `;
                    stepsContainer.appendChild(stepDiv);
                });
            } else {
                stepsContainer.innerHTML = '<p style="color: #64748b;">詳細な手順データがありませんでした。</p>';
            }
        }

        // Re-init icons for newly injected DOM
        lucide.createIcons();
    }
});
