// --- НАСТРОЙКИ ---
const SUPABASE_URL = 'https://htvbjrrqlkhkbjcgtzrw.supabase.co';
const SUPABASE_KEY = 'sb_publishable_MIY-N1IJ-lcIIRDTJ8viHA_NmqKV2cU';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
let currentUser = null;
let isAdmin = false;

const SYSTEM_PROMPT = `Ты — профессиональный фитнес-тренер и нутрициолог по имени Сан. Твоя задача — помогать пользователю с тренировками и питанием. Если пользователь присылает фото еды, оценивай КБЖУ. Отвечай дружелюбно, коротко и по делу.`;

let chatHistory = JSON.parse(localStorage.getItem('fitnessChatHistory')) || [{ role: "assistant", content: "Привет! Я Сан. Могу составить план тренировок или посчитать калории по фото еды." }];
let selectedImageBase64 = null;

// --- АВТОРИЗАЦИЯ ---
const authScreen = document.getElementById('auth-screen');
const appScreen = document.getElementById('app-screen');

document.getElementById('btn-login').onclick = async () => {
  const email = document.getElementById('auth-email').value;
  const pass = document.getElementById('auth-pass').value;
  const { error } = await sb.auth.signInWithPassword({ email, password: pass });
  if (error) document.getElementById('auth-msg').textContent = error.message;
};

document.getElementById('btn-register').onclick = async () => {
  const email = document.getElementById('auth-email').value;
  const pass = document.getElementById('auth-pass').value;
  const { error } = await sb.auth.signUp({ email, password: pass });
  if (error) document.getElementById('auth-msg').textContent = error.message;
  else document.getElementById('auth-msg').textContent = 'Успешно! Теперь войдите.';
};

document.getElementById('btn-logout').onclick = () => sb.auth.signOut();

sb.auth.onAuthStateChange(async (event, session) => {
  if (session) {
    currentUser = session.user;
    authScreen.style.display = 'none';
    appScreen.style.display = 'flex';
    
    // Проверяем роль через функцию (обход блокировок)
    const { data } = await sb.rpc('get_my_role');
    isAdmin = data === 'admin';
    document.getElementById('user-role').textContent = isAdmin ? 'Роль: Админ 👑' : 'Роль: Клиент';
    
    switchTab('chat', document.querySelector('.nav-btn'));
  } else {
    currentUser = null; isAdmin = false;
    authScreen.style.display = 'flex'; appScreen.style.display = 'none';
  }
});

// --- ВКЛАДКИ ---
async function switchTab(tabId, btnElement) {
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  if(btnElement) btnElement.classList.add('active');
  
  const contentArea = document.getElementById('content-area');
  
  if (tabId === 'chat') {
    contentArea.innerHTML = `
      <div id="chat-messages" style="display:flex; flex-direction:column; padding-bottom: 80px;"></div>
      <div class="input-area" style="position:absolute; bottom:10px; left:10px; right:10px; background:var(--app-bg);">
        <input type="file" id="image-input" accept="image/*" style="display:none;">
        <button id="image-btn" style="background:none; border:none; color:var(--text); font-size:20px; cursor:pointer;">📷</button>
        <input type="text" id="user-input" placeholder="Напиши сообщение...">
        <button id="send-btn">➤</button>
      </div>
    `;
    
    const chatDiv = document.getElementById('chat-messages');
    chatDiv.innerHTML = '';
    chatHistory.forEach(m => {
      if(m.role !== 'system') addMessageToUI(m.content, m.role === 'user' ? 'user' : 'bot', m.image);
    });

    document.getElementById('send-btn').onclick = sendMessage;
    document.getElementById('user-input').addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });
    
    const imgBtn = document.getElementById('image-btn');
    const imgInput = document.getElementById('image-input');
    imgBtn.onclick = () => imgInput.click();
    imgInput.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 500;
          const scale = MAX_WIDTH / img.width;
          canvas.width = MAX_WIDTH;
          canvas.height = img.height * scale;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          selectedImageBase64 = canvas.toDataURL('image/jpeg', 0.6);
          document.getElementById('user-input').placeholder = "Фото прикреплено...";
        };
        img.src = event.target.result;
      };
      reader.readAsDataURL(file);
    };
  } 
  else if (tabId === 'clients' || tabId === 'schedule') {
    contentArea.innerHTML = '<p>Загрузка...</p>';
    const { data } = await sb.from('app_data').select('content').eq('id', tabId).single();
    const text = data?.content || 'Нет данных';
    
    contentArea.innerHTML = `
      <div class="tab-content">
        <h2>${tabId === 'clients' ? '👥 Клиенты' : '📅 График'}</h2>
        <div class="card">
          <div id="text-view" style="white-space: pre-wrap;">${text}</div>
          ${isAdmin ? `<button class="edit-btn" style="margin-top:15px; padding:8px 12px; background:var(--accent); color:white; border:none; border-radius:8px; cursor:pointer;" onclick="enableEdit('${tabId}')">✏️ Редактировать</button>` : ''}
          <textarea class="edit-area" id="edit-box">${text}</textarea>
          <button id="save-btn" style="display:none; margin-top:10px; padding:8px 12px; background:#4caf50; color:white; border:none; border-radius:8px; cursor:pointer;" onclick="saveData('${tabId}')">💾 Сохранить</button>
        </div>
      </div>
    `;
  }
}

window.enableEdit = function(tabId) {
  document.getElementById('text-view').style.display = 'none';
  document.getElementById('edit-box').style.display = 'block';
  document.getElementById('save-btn').style.display = 'inline-block';
  document.querySelector('.edit-btn').style.display = 'none';
}

// --- СОХРАНЕНИЕ ЧЕРЕЗ ФУНКЦИЮ (ОБХОД БЛОКИРОВОК) ---
window.saveData = async function(tabId) {
  const newText = document.getElementById('edit-box').value;
  
  const { error } = await sb.rpc('update_my_data', { 
    data_id: tabId, 
    new_content: newText 
  });
  
  if (error) {
    alert('Ошибка доступа: ' + error.message);
  } else {
    alert('Сохранено!');
    switchTab(tabId, document.querySelector('.nav-btn.active'));
  }
}

// --- ЧАТ ---
function addMessageToUI(text, className, imageUrl = null) {
    const chatContainer = document.getElementById('chat-messages');
    if(!chatContainer) return;
    const div = document.createElement('div');
    div.className = `message ${className}`;
    let html = '';
    if (imageUrl) html += `<img src="${imageUrl}" style="max-width:100%; border-radius:10px; margin-bottom:5px;">`;
    if (className === 'bot' && typeof marked !== 'undefined') html += marked.parse(text); else html += text;
    div.innerHTML = html;
    chatContainer.appendChild(div);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

function showTyping() {
    const chatContainer = document.getElementById('chat-messages');
    if(!chatContainer) return;
    const div = document.createElement('div');
    div.id = 'typing-indicator';
    div.className = 'message bot typing';
    div.innerHTML = '<span>•</span><span>•</span><span>•</span>';
    chatContainer.appendChild(div);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

function hideTyping() {
    const el = document.getElementById('typing-indicator');
    if (el) el.remove();
}

async function sendMessage() {
  const userInput = document.getElementById('user-input');
  const text = userInput.value.trim();
  const imageToSend = selectedImageBase64;
  if (!text && !imageToSend) return;

  userInput.value = '';
  userInput.placeholder = "Напиши сообщение...";
  selectedImageBase64 = null;
  document.getElementById('send-btn').disabled = true;

  addMessageToUI(text || "Фото еды", 'user', imageToSend);
  chatHistory.push({ role: "user", content: text || "Фото еды", image: imageToSend });
  localStorage.setItem('fitnessChatHistory', JSON.stringify(chatHistory));
  showTyping();

  try {
    const modelToUse = imageToSend ? 'qwen/qwen3.8-27b' : 'openai/gpt-oss-120b';
    
    // ЗАПРОС К НАШЕМУ СЕРВЕРУ НА RENDER
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelToUse,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...chatHistory.slice(-4).map(m => { 
            if (m.image) return { role: m.role, content: [{ type: "image_url", image_url: { url: m.image } }, { type: "text", text: m.content }] };
            return { role: m.role, content: m.content };
          })
        ],
        max_tokens: 1024,
        temperature: 0.7
      })
    });

    if (!response.ok) throw new Error((await response.json()).error?.message || 'Ошибка');
    
    const data = await response.json();
    const botReply = data.choices[0].message.content;

    hideTyping();
    addMessageToUI(botReply, 'bot');
    chatHistory.push({ role: "assistant", content: botReply });
    localStorage.setItem('fitnessChatHistory', JSON.stringify(chatHistory));
  } catch (error) {
    hideTyping();
    addMessageToUI(`Ошибка: ${error.message}`, 'bot');
  } finally {
    document.getElementById('send-btn').disabled = false;
    userInput.focus();
  }
}
