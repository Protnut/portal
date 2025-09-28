// /js/app.js - fixed version_0925
// 若 portal.html 還呼叫 validateFiles，這個 wrapper 會呼叫現有的 isDangerousFile 檢查
window.validateFiles = function(input){
  const files = input.files || [];
  for(let i=0;i<files.length;i++){
    if(isDangerousFile(files[i].name)){
      alert('禁止上傳此類型檔案：' + files[i].name);
      input.value = '';
      return;
    }
  }
};

// ===== 常數與 helper =====
const DANGEROUS_EXTS = ['.exe','.msi','.bat','.cmd','.com','.scr','.js','.vbs','.ps1','.jar','.sh'];
function fileExt(name){ return (name || '').slice((name || '').lastIndexOf('.')).toLowerCase(); }
function isDangerousFile(name){ const ext = fileExt(name); return DANGEROUS_EXTS.includes(ext); }

function getDomainFromEmail(email){
  if(!email) return '';
  const parts = email.split('@');
  return parts.length === 2 ? parts[1] : email;
}

// 全域當前使用者（會由 onAuthStateChanged 設定）
window.CURRENT_USER = null;

function isAdminUser(){ return window.CURRENT_USER && window.CURRENT_USER.role === 'admin'; }
function isProjectOwner(proj){ return auth.currentUser && proj && proj.owner === auth.currentUser.uid; }

const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

// ---------- config ----------
const ADMIN_EMAILS = ["rob@protnut.com"]; 
const FREE_EMAIL_PROVIDERS = ["gmail.com","yahoo.com","hotmail.com","outlook.com","protonmail.com","yahoo.com.tw"];
const ALLOWED_TLDS = [".com", ".com.tw", ".net"];
// --------------------------------------------------------

// workflow
const WORKFLOW = ["uploaded", "dfm", "quoted", "po_received", "prototyping", "delivery"];
const WORKFLOW_LABELS = {
  uploaded: "估價",
  dfm: "DFM",
  quoted: "報價",
  po_received: "下單",
  prototyping: "試樣",
  delivery: "出貨"
};

// UI 元件
const suEmail = document.getElementById('su-email');
const suPw = document.getElementById('su-pw');
const btnSignup = document.getElementById('btn-signup');

const liEmail = document.getElementById('li-email');
const liPw = document.getElementById('li-pw');
const btnLogin = document.getElementById('btn-login');
const btnLogout = document.getElementById('btn-logout');
const authMsg = document.getElementById('auth-msg');

const userArea = document.getElementById('user-area');
const userEmailEl = document.getElementById('user-email');
const userNote = document.getElementById('user-note');
const btnNewProject = document.getElementById('btn-new-project');
const btnViewProjects = document.getElementById('btn-view-projects');

const newProjectArea = document.getElementById('new-project-area');
const projTitle = document.getElementById('proj-title');
const projFile = document.getElementById('proj-files');
const btnCreateProject = document.getElementById('btn-create-project');

const projectsList = document.getElementById('projects-list');
const projectsContainer = document.getElementById('projects-container');

const adminArea = document.getElementById('admin-area');
const pendingList = document.getElementById('pending-list');
const adminProjects = document.getElementById('admin-projects');
const notificationsContainer = document.getElementById('notifications');

// helpers
function show(el){ if(el) el.classList.remove('hidden'); }
function hide(el){ if(el) el.classList.add('hidden'); }

function isAdmin(udata) {
  return udata && udata.role === 'admin';
}
function isFreeEmail(email){
  const lower = String(email || '').toLowerCase();
  return FREE_EMAIL_PROVIDERS.some(d => lower.endsWith('@'+d));
}
function isAllowedTld(email){
  const parts = String(email || '').split('@');
  if(parts.length !== 2) return false;
  const domain = parts[1].toLowerCase();
  return ALLOWED_TLDS.some(t => domain.endsWith(t));
}

function nextStatus(curr){
  const idx = WORKFLOW.indexOf(curr);
  if(idx === -1) return curr;
  if(idx === WORKFLOW.length - 1) return curr;
  return WORKFLOW[idx + 1];
}

// 替換整個 renderWorkflowTable 函式（放在 app.js 原來 renderWorkflowTable 的地方）
function renderWorkflowTable(projectId, projectData){
  const steps = projectData.steps || {};
  const attachments = projectData.attachments || [];

  // 狀態中文顯示
  const STATUS_LABEL = { not_started: 'unstarted', in_progress: 'OnGoing', completed: 'Finished' };

  let html = `<div class="table-responsive">
  <table class="table table-bordered" style="table-layout: fixed;"><thead>
    <tr>
      <th>流程</th>
      <th>state</th>
      <th>執行方</th>
      <th>附件 (報告, 參考文件….)</th>
      <th>執行方備註</th>
      <th>確認方</th>
      <th>確認方備註</th>
      <th>確認</th>
    </tr>
    </thead><tbody>`;

  WORKFLOW.forEach(stepKey => {
    const wf = WORKFLOW_DETAIL[stepKey] || { label: stepKey, executor: 'customer', confirmer: 'admin' };
    const step = steps[stepKey] || { status: 'not_started', executorNote: '', confirmNote:'', executorLocked:false };
    const currentBadge = (projectData.status === stepKey) 
      ? '<span class="badge bg-info ms-1">目前</span>' 
      : '';
      
    // 判斷誰是執行方 / 確認方（以 executor/confirmer 欄位）
    const executorRole = wf.executor || 'customer';
    const confirmerRole = wf.confirmer || (executorRole === 'customer' ? 'admin' : 'customer');

    const currentUserIsExecutor = (executorRole === 'customer' && auth.currentUser && projectData.owner === auth.currentUser.uid)
                                  || (executorRole === 'admin' && isAdminUser());
    const currentUserIsConfirmer = (confirmerRole === 'customer' && auth.currentUser && projectData.owner === auth.currentUser.uid)
                                   || (confirmerRole === 'admin' && isAdminUser());

    const canEdit = currentUserIsExecutor && step.status !== 'completed';
    const canConfirm = currentUserIsConfirmer && step.status === 'in_progress';

    // 附件欄：所有 step 都顯示上傳 input（當前 user 為執行方且 step 未完成）
    let filesHtml = (attachments||[])
      .filter(a => a.step === stepKey)
      .map(a => {
        let delBtn = '';
        if (canEdit) {
          delBtn = `<button class="btn btn-sm btn-danger ms-1" onclick="deleteAttachment('${projectId}','${a.storagePath}')">刪除</button>`;
        }
        return `<div>
          <a href="${a.downloadUrl}" target="_blank">${a.name}</a> ${delBtn}
        </div>`;
      })
      .join('') || '-';
      
    if(canEdit){
      filesHtml += `<div class="mt-1">
        <input type="file" id="step-file-${projectId}-${stepKey}" onchange="uploadStepAttachment('${projectId}','${stepKey}', this)" />
      </div>`;
    }

    // 執行方備註欄
    const fullExecutor = step.executorNote || '';
    const safeFullExecutor = escapeHtml(fullExecutor);
    const shortExecutor = fullExecutor.length > 100 ? escapeHtml(fullExecutor.substring(0,100) + '...') : safeFullExecutor;

    const executorNoteHtml = (canEdit && !step.executorLocked)
      ? `<div class="overflow-auto" style="max-height: 100px; max-width: 200px; word-break: break-all;">
           <textarea id="step-note-${projectId}-${stepKey}" class="form-control remark-cell" rows="2" maxlength="500">${escapeHtml(step.executorNote||'')}</textarea>
           <button class="btn btn-sm btn-primary mt-1" onclick="saveExecutorNote('${projectId}','${stepKey}')">儲存執行方備註</button>
         </div>`
      : `<div class="remark-cell" style="max-width: 200px; word-break: break-all;">
          <span class="remark-text" data-full="${safeFullExecutor}">${shortExecutor}</span>
          ${(fullExecutor && fullExecutor.length > 100) ? '<a class="toggle-remark">更多</a>' : ''}
        </div>

    // 確認方顯示名稱（admin -> PROTNUT；customer -> domain）
    const confirmerLabel = (confirmerRole === 'admin') ? 'PROTNUT' : getDomainFromEmail(projectData.ownerEmail);

    // 確認方備註：**移除儲存按鈕**，只顯示 textarea（可編輯的條件：目前使用者為確認方且 step 未完成）
    const fullConfirm = step.confirmNote || '';
    const safeFullConfirm = escapeHtml(fullConfirm);
    const shortConfirm = fullConfirm.length > 100 ? escapeHtml(fullConfirm.substring(0,100) + '...') : safeFullConfirm;

    const confirmNoteHtml = (currentUserIsConfirmer && step.status !== 'completed')
      ? `<div class="overflow-auto" style="max-height: 100px; max-width: 200px; word-break: break-all;">
           <textarea id="confirm-note-${projectId}-${stepKey}" class="form-control remark-cell" rows="2" maxlength="500">${escapeHtml(step.confirmNote||'')}</textarea>
         </div>`
      : `<div class="remark-cell overflow-auto" style="max-height: 100px; max-width: 200px; word-break: break-all;">
           <span class="remark-text" data-full="${safeFullConfirm}">${shortConfirm}</span>
           ${(fullConfirm && fullConfirm.length > 100) ? '<a class="toggle-remark">更多</a>' : '<a class="toggle-remark" style="display:none"></a>'}
         </div>`;

    // 確認完成欄（按鈕或顯示完成者）
    let confirmCell = '';
    if(canConfirm){
      confirmCell = `<button class="btn btn-success" onclick="confirmStep('${projectId}','${stepKey}')">確認完成</button>`;
    } else if(step.status === 'completed'){
      const by = step.confirmedBy || '';
      const at = step.confirmedAt ? new Date(step.confirmedAt).toLocaleString() : '';
      const byDomain = by ? getDomainFromEmail(by) : '';
      const atFormatted = step.confirmedAt ? new Date(step.confirmedAt).toLocaleString('zh-TW', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false
      }).replace(/\//g,'/').replace(',','') : '';

      confirmCell = `✅ 已完成 ${byDomain ? 'by ' + byDomain : ''} ${atFormatted ? '('+atFormatted+')' : ''}`;
    } else {
      confirmCell = '-';
    }

    html += `<tr>
      <td>${WORKFLOW_LABELS[stepKey] || wf.label || stepKey}${currentBadge}</td>
      <td>${STATUS_LABEL[step.status] || step.status}</td>
      <td>${wf.executor === 'customer' ? getDomainFromEmail(projectData.ownerEmail) : 'PROTNUT'}</td>
      <td style="width: 20%;">${filesHtml}</td>
      <td style="width: 15%;">${executorNoteHtml}</td>
      <td>${confirmerLabel}</td>
      <td style="width: 15%;">${confirmNoteHtml}</td>
      <td>${confirmCell}</td>
    </tr>`;
  });

  html += '</tbody></table></div>';  // 關閉 table-responsive div

    // 管理者 override
    if(isAdminUser()){
      html += `<div class="mt-2"><strong>管理員操作</strong>：
        <button class="btn btn-sm btn-warning" onclick="adminOverrideStepPrompt('${projectId}')">修正步驟 / 強制完成</button>
      </div>`;
    }

    // 初始化所有 tooltip（Bootstrap 5 需要 JS 啟用）
    setTimeout(() => {
      const tooltipTriggerList = document.querySelectorAll('[data-bs-toggle="tooltip"]');
      const tooltipList = [...tooltipTriggerList].map(tooltipTriggerEl => new bootstrap.Tooltip(tooltipTriggerEl));
    }, 0);

    return html;
}

// 放置位置：renderWorkflowTable() 結束之後
function setupRemarkToggle() {
  // 找到所有 .toggle-remark，並確保不會重複綁定 handler
  document.querySelectorAll('.toggle-remark').forEach(link => {
    // 若先前綁過 handler，先移除（避免重複觸發）
    if (link._handler) link.removeEventListener('click', link._handler);

    const span = link.previousElementSibling;
    if (!span) return;

    const full = span.getAttribute('data-full') || '';
    const short = (full.length > 100) ? (full.substring(0,100) + '...') : full;

    // 初始化顯示（若長度超過 100，預設顯示短版）
    if (full.length > 100) {
      span.textContent = short;
      link.textContent = '更多';
      link.style.display = ''; // 確保可見
    } else {
      // 若內容短，不需要「更多」按鈕
      link.style.display = 'none';
      span.textContent = full;
    }

    const handler = function(e) {
      e.preventDefault();
      if (span.textContent === short) {
        span.textContent = full;
        link.textContent = '收起';
        span.parentElement.style.maxHeight = 'none';  // 🔑 展開後移除限制
      } else {
        span.textContent = short;
        link.textContent = '更多';
        span.parentElement.style.maxHeight = '100px'; // 🔑 收起再加回限制
      }
    };

    link._handler = handler; // 存起來以便下次移除
    link.addEventListener('click', handler);
  });
}

// 放在 helper 區（renderWorkflowTable 之前或之後都可以）
function escapeHtml(s){
  return String(s || '')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}


// 上傳 step 檔案 - 只允許執行方上傳
window.uploadStepAttachment = async function(projectId, stepKey, inputEl){
  const f = inputEl.files[0];
  if(!f){ alert('請選檔案'); return; }
  if(isDangerousFile(f.name)){ alert('禁止上傳此類型檔案：' + f.name); inputEl.value=''; return; }

  const uid = auth.currentUser.uid;
  const path = `user_uploads/${uid}/projects/${projectId}/${Date.now()}_${f.name}`;
  const storageRef = storage.ref().child(path);
  try{
    await storageRef.put(f);
    const url = await storageRef.getDownloadURL();
    const attachObj = {
      name: f.name, storagePath: path, downloadUrl: url, type: 'step-file',
      step: stepKey, uploadedBy: auth.currentUser.email, uploadedAt: Date.now()
    };
    await db.collection('projects').doc(projectId).update({
      attachments: firebase.firestore.FieldValue.arrayUnion(attachObj),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    // 可依 stepKey 做特殊行為：例如 uploaded/po_received 可自動切換 status（如果需要）
    if(stepKey === 'po_received'){
      await db.collection('projects').doc(projectId).update({
        status: 'po_received',
        history: firebase.firestore.FieldValue.arrayUnion({ status:'po_received', by: auth.currentUser.email, ts: Date.now(), note:'客戶下單上傳檔案' }),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }

    alert('上傳成功');
    viewProject(projectId);
  }catch(e){ alert('上傳失敗: ' + e.message); }
};

// 刪除附件（執行方在尚未確認前可刪）
// 使用 storagePath 做刪除與 filter
window.deleteAttachment = async function(projectId, storagePath){
  if(!confirm('確定要刪除此檔案？')) return;
  const docRef = db.collection('projects').doc(projectId);
  const snap = await docRef.get();
  if(!snap.exists) return;
  const d = snap.data();
  const attach = (d.attachments || []).find(a => a.storagePath === storagePath);
  if(!attach){ alert('找不到附件'); return; }
  // 檢查是否允許刪除（必須是該 step 執行方，且 step 未完成，或管理者）
  const stepKey = attach.step;
  const step = (d.steps && d.steps[stepKey]) || { status: 'not_started' };
  // 取 attach.step -> 找 WF 設定
  const wf = WORKFLOW_DETAIL[attach.step] || { executor: 'customer' };
  const executorRole = wf.executor || 'customer';
  const currentUserIsExecutor = (executorRole === 'customer' && auth.currentUser && d.owner === auth.currentUser.uid)
                              || (executorRole === 'admin' && isAdminUser());
  const stepObj = (d.steps && d.steps[attach.step]) || {};
  if(!currentUserIsExecutor || stepObj.status === 'completed'){
    alert('您無權刪除此附件或該步驟已完成');
    return;
  }

  try{
    // 刪 storage
    await storage.ref().child(storagePath).delete().catch(()=>{/*若 storage 刪不到也繼續處理 DB */});
    // 更新 DB：把 attachments filter 掉
    const newAttachments = (d.attachments || []).filter(a => a.storagePath !== storagePath);
    await docRef.update({ attachments: newAttachments, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
    alert('刪除完成');
    viewProject(projectId);
  }catch(e){ alert('刪除失敗: ' + e.message); }
};

// 儲存執行方備註
window.saveExecutorNote = async function(projectId, stepKey){
  const ta = document.getElementById(`step-note-${projectId}-${stepKey}`);
  if(!ta) return;
  const note = (ta.value || '').trim();

  // 若為空字串，不做任何事（沒有 alert）
  if(note === '') return;

  const docRef = db.collection('projects').doc(projectId);
  const snap = await docRef.get();
  if(!snap.exists) return;
  const d = snap.data();
  const wf = WORKFLOW_DETAIL[stepKey] || { executor: 'customer' };
  const executorRole = wf.executor || 'customer';
  const currentUserIsExecutor = (executorRole === 'customer' && auth.currentUser && d.owner === auth.currentUser.uid)
                                || (executorRole === 'admin' && isAdminUser());

  // 權限/狀態檢查
  const step = (d.steps && d.steps[stepKey]) || {};
  if(!currentUserIsExecutor || step.status === 'completed' || step.executorLocked){
    alert('無權編輯或此步驟已被鎖定');
    return;
  }

  const updateObj = {};
  updateObj[`steps.${stepKey}.executorNote`] = note;
  updateObj[`steps.${stepKey}.executorLocked`] = true;
  updateObj.updatedAt = firebase.firestore.FieldValue.serverTimestamp();

  await docRef.update(updateObj);
  alert('執行方備註已儲存並鎖定（不可再修改）');
  viewProject(projectId);
};

// 儲存確認方備註（只有確認方或 admin 在 step 未完成時可儲存）
window.saveConfirmNote = async function(projectId, stepKey){
  const ta = document.getElementById(`confirm-note-${projectId}-${stepKey}`);
  if(!ta) return;
  const note = ta.value || '';

  const docRef = db.collection('projects').doc(projectId);
  const snap = await docRef.get();
  if(!snap.exists) return;
  const d = snap.data();
  const step = (d.steps && d.steps[stepKey]) || {};
  const wf = WORKFLOW_DETAIL[stepKey] || {};
  const executorIsCustomer = wf.role === 'customer';
  const confirmRoleIsAdmin = !executorIsCustomer;
  const currentUserIsConfirmer = (confirmRoleIsAdmin && isAdminUser()) || (!confirmRoleIsAdmin && auth.currentUser && d.owner === auth.currentUser.uid);

  if(!currentUserIsConfirmer || step.status === 'completed'){
    alert('您無權編輯確認備註或該步驟已鎖定');
    return;
  }

  const updateObj = {};
  updateObj[`steps.${stepKey}.confirmNote`] = note;
  updateObj.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
  await docRef.update(updateObj);
  alert('確認備註已儲存');
  viewProject(projectId);
};

window.confirmStep = async function(projectId, stepKey){
  if(!confirm('確定要由確認方確認此步驟完成？')) return;
  const docRef = db.collection('projects').doc(projectId);
  const snap = await docRef.get(); if(!snap.exists) return;
  const d = snap.data();

  const wf = WORKFLOW_DETAIL[stepKey] || {};
  const confirmerRole = wf.confirmer || (wf.executor === 'customer' ? 'admin' : 'customer');
  const currentUserIsConfirmer = (confirmerRole === 'customer' && auth.currentUser && d.owner === auth.currentUser.uid)
                                 || (confirmerRole === 'admin' && isAdminUser());
  if(!currentUserIsConfirmer && !isAdminUser()){ alert('您不是此步驟的確認方'); return; }

  const confirmTa = document.getElementById(`confirm-note-${projectId}-${stepKey}`);
  const confirmNote = confirmTa ? (confirmTa.value || '') : ((d.steps && d.steps[stepKey] && d.steps[stepKey].confirmNote) || '');
  // ✅ 特殊規則：DFM 必須有附件才能完成
  if (stepKey === 'dfm') {
    const hasAttachment = (d.attachments || []).some(a => a.step === 'dfm');
    if (!hasAttachment) {
      alert('請先由管理者上傳 DFM 附件，才能完成此流程');
      return;
    }
  }
    
  // update
  const updateObj = {};
  updateObj[`steps.${stepKey}.status`] = 'completed';
  updateObj[`steps.${stepKey}.confirmedBy`] = auth.currentUser.email;
  updateObj[`steps.${stepKey}.confirmedAt`] = Date.now();
  updateObj[`steps.${stepKey}.confirmNote`] = confirmNote;
  updateObj.history = firebase.firestore.FieldValue.arrayUnion({
    status: stepKey, by: auth.currentUser.email, ts: Date.now(), note: '確認完成' + (confirmNote ? (' — ' + confirmNote) : '')
  });

  // 將 project status 進到下一個 step（若有）
  const idx = WORKFLOW.indexOf(stepKey);
  if(idx !== -1 && idx < WORKFLOW.length - 1){
      const next = WORKFLOW[idx + 1];
      updateObj.status = next;
      updateObj[`steps.${next}`] = {
        status: 'in_progress',
        executorNote: '',
        confirmNote: '',
        confirmedBy: '',
        confirmedAt: null,
        executorLocked: false
      };

      if(next === 'quoted'){
        updateObj.history = firebase.firestore.FieldValue.arrayUnion({
          status: 'quoted',
          by: auth.currentUser.email,
          ts: Date.now(),
          note: 'DFM 完成，自動進入報價流程'
        });
      }
    } else {
    updateObj.status = 'completed_all';
  }
  updateObj.updatedAt = firebase.firestore.FieldValue.serverTimestamp();

  await docRef.update(updateObj);

  // optional: 發通知
  await db.collection('notifications').add({
    type: 'task_completed', projectId, completed: stepKey, by: auth.currentUser.email, createdAt: firebase.firestore.FieldValue.serverTimestamp(), status: 'unread'
  });

  alert('已確認完成');
  viewProject(projectId);
};


window.adminOverrideStepPrompt = function(projectId){
  const step = prompt('輸入要修正的 step 名稱 (例如 uploaded, dfm, quoted, po_received, prototyping, delivery)');
  if(!step) return;
  const status = prompt('輸入新狀態 (not_started / in_progress / completed)');
  if(!status) return;
  adminOverrideStep(projectId, step, status);
};

window.adminOverrideStep = async function(projectId, stepKey, newStatus){
  if(!isAdminUser()){ alert('僅管理者可操作'); return; }
  const docRef = db.collection('projects').doc(projectId);
  const snap = await docRef.get(); if(!snap.exists) return;
  const updateObj = {};
  updateObj[`steps.${stepKey}.status`] = newStatus;
  updateObj.history = firebase.firestore.FieldValue.arrayUnion({
    status: stepKey, by: auth.currentUser.email, ts: Date.now(), note: `管理員強制設為 ${newStatus}`
  });
  if(newStatus === 'completed'){
    const idx = WORKFLOW.indexOf(stepKey);
    const next = WORKFLOW[idx+1];
    if(next){ updateObj.status = next; updateObj[`steps.${next}.status`] = 'in_progress'; }
    else { updateObj.status = 'completed_all'; }
  } else if(newStatus === 'in_progress'){
    updateObj.status = stepKey;
  }
  updateObj.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
  await docRef.update(updateObj);
  alert('管理員已更新步驟狀態');
  viewProject(projectId);
};


// ================ Signup ===================
if(btnSignup){
  btnSignup.onclick = async () => {
    const email = (suEmail.value || '').trim();
    const pw = suPw.value || '';
    if(!email || !pw){ alert('請填 email 與密碼'); return; }

    if(isFreeEmail(email)){
      alert('免費信箱不得註冊');
      return;
    }
    if(!isAllowedTld(email)){
      alert(`僅允許 ${ALLOWED_TLDS.join(', ')} 公司信箱`);
      return;
    }

    try{
      const cred = await auth.createUserWithEmailAndPassword(email, pw);
      await cred.user.sendEmailVerification();

      await db.collection('users').doc(cred.user.uid).set({
        email: email,
        approved: false,
        role: 'customer',
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      await db.collection('notifications').add({
        type: 'new_signup',
        email: email,
        uid: cred.user.uid,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        status: 'unread'
      });

      alert('註冊成功，請驗證 Email 並等待管理員審核');
      suEmail.value = ''; suPw.value = '';
    }catch(e){
      alert('註冊失敗：' + e.message);
    }
  };
}

// ================ Login ===================
if(btnLogin){
  btnLogin.onclick = async () => {
    const email = (liEmail.value || '').trim();
    const pw = liPw.value || '';
    try{
      const { user } = await auth.signInWithEmailAndPassword(email, pw);
      if(!user.emailVerified){
        authMsg.innerText = '請先完成 Email 驗證';
        await auth.signOut();
        return;
      }
      const ud = await db.collection('users').doc(user.uid).get();
      if(!ud.exists){
        authMsg.innerText = '帳號資料不存在';
        await auth.signOut();
        return;
      }
      const udata = ud.data();
      if(!udata.approved){
        authMsg.innerText = '帳號尚未審核通過';
        await auth.signOut();
        return;
      }
      setupUIForUser(user, udata);
    }catch(e){
      alert('登入失敗：' + e.message);
    }
  };
}

if(btnLogout){
  btnLogout.onclick = async ()=>{ await auth.signOut(); location.reload(); };
}

// ================ Auth state change ===================
auth.onAuthStateChanged(async user => {
  if(!user){
    hide(userArea); hide(adminArea); hide(btnLogout);
    show(document.getElementById('signup-form')); show(document.getElementById('login-form'));
    return;
  }

  const udRef = db.collection('users').doc(user.uid);
  const udSnap = await udRef.get();
  if(!udSnap.exists){
    await udRef.set({
      email: user.email,
      approved: false,
      role: 'customer',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    await db.collection('notifications').add({
      type: 'new_signup',
      email: user.email,
      uid: user.uid,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      status: 'unread'
    });
    alert('帳號資料已建立，請等待管理員審核');
    await auth.signOut();
    location.reload();
    return;
  }

  const udata = udSnap.data();
  if(!udata.approved){
    alert('您的帳號尚未審核通過');
    await auth.signOut();
    location.reload();
    return;
  }
    // ✅ 把使用者角色存到全域，isAdminUser() 才能正確判斷
  window.CURRENT_USER = { 
    uid: user.uid, 
    email: user.email, 
    role: udata.role 
  };

  setupUIForUser(user, udata);
});

// ================ UI & App functions ===================
async function setupUIForUser(user, udata) {
  document.getElementById('auth-area').classList.add('hidden');
  show(btnLogout);
  show(userArea);
  userEmailEl.innerText = user.email;
  userNote.innerText = udata.role === 'admin' ? '（管理員）' : '';

  if (isAdmin(udata)) { // 使用角色檢查
    show(adminArea);
    loadPendingUsers();
    loadAllProjectsForAdmin();
    loadNotificationsForAdmin();
  } else {
    hide(adminArea);
  }

  if(btnNewProject) btnNewProject.onclick = ()=> show(newProjectArea);
// ✅ 登入後自動載入「我的專案」
     loadMyProjects();
     show(projectsList);

    if (btnCreateProject) {
      // 假設你已經在 setupUIForUser 之中有 btnCreateProject 綁定
        btnCreateProject.onclick = async () => {
          const title = (projTitle.value || '').trim();
          const files = document.getElementById('proj-files').files;
          if (!title || files.length === 0) { alert('請填名稱並選檔案'); return; }
          btnCreateProject.disabled = true;
          try {
            // 建立 steps 初始狀態
            const stepsInit = {};
            WORKFLOW.forEach(s => {
              stepsInit[s] = {
              status: s === 'uploaded' ? 'in_progress' : 'not_started',
              executorNote: '',
              confirmNote: '',         // 新增：確認方的備註（可於確認前編輯）
              confirmedBy: '',
              confirmedAt: null
            };
            });

            const pRef = await db.collection('projects').add({
              owner: auth.currentUser.uid,
              ownerEmail: auth.currentUser.email,
              title: title,
              status: 'uploaded',  // project level status: current active step
              steps: stepsInit,
              attachments: [], // 會在下方上傳後填入
              history: [{ status: 'uploaded', by: auth.currentUser.email, ts: Date.now(), note: '客戶上傳估價檔' }],
              createdAt: firebase.firestore.FieldValue.serverTimestamp(),
              updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            const projectId = pRef.id;
            const uid = auth.currentUser.uid;
            const attachments = [];
            for (let file of files) {
              if(isDangerousFile(file.name)){ alert('禁止上傳此類型檔案：' + file.name); continue; }
              const filePath = `user_uploads/${uid}/projects/${projectId}/${Date.now()}_${file.name}`;
              const storageRef = storage.ref().child(filePath);
              await storageRef.put(file);
              const url = await storageRef.getDownloadURL();
              attachments.push({
                name: file.name,
                storagePath: filePath,
                downloadUrl: url,
                type: 'estimate-file',
                step: 'uploaded',        // 關聯到 'uploaded' step
                uploadedBy: auth.currentUser.email,
                uploadedAt: Date.now()
              });
            }

            // 更新 attachments 到 project 中（不自動 advance）
            await pRef.update({
              attachments: attachments,
              updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            await db.collection('notifications').add({
              type: 'new_project', projectId: projectId, ownerEmail: auth.currentUser.email,
              createdAt: firebase.firestore.FieldValue.serverTimestamp(), status: 'unread'
            });

            alert('專案建立成功');
            projTitle.value = ''; document.getElementById('proj-files').value = '';
            loadMyProjects();
            show(projectsList);
          } catch (e) {
            alert('建立失敗: ' + e.message);
          }
          btnCreateProject.disabled = false;
        };
    };
}

// ================ Projects (client) ===================
async function loadMyProjects() {
  projectsContainer.innerHTML = '<p>讀取中...</p>';
  try {
    const user = auth.currentUser;
    const q = await db.collection('projects').where('owner', '==', user.uid).orderBy('createdAt', 'desc').get();
    if (q.empty) { 
      projectsContainer.innerHTML = '<i>尚無案件</i>'; 
      return; 
    }

    let html = `<table class="table table-striped table-hover">
      <thead><tr><th>專案名</th><th>狀態</th><th>進度條</th><th>附件</th><th>操作</th></tr></thead><tbody>`;
    q.forEach(doc => {
      const d = doc.data(); const id = doc.id;
      const progressIdx = WORKFLOW.indexOf(d.status);
      const progressPct = Math.round((progressIdx / (WORKFLOW.length - 1)) * 100);
      const attachmentsHtml = (d.attachments || []).map(a => `<a href="${a.downloadUrl}" target="_blank">${a.name}</a>`).join('<br>') || '-';

      html += `<tr>
        <td>${d.title}</td>
        <td>${WORKFLOW_LABELS[d.status] || d.status}</td>
        <td><div class="progress"><div class="progress-bar" style="width: ${progressPct}%">${progressPct}%</div></div></td>
        <td>${attachmentsHtml}</td>
        <td><button class="btn btn-sm btn-info" onclick="viewProject('${id}')">詳細檢視</button></td>
      </tr>`;
    });
    html += '</tbody></table>';
    projectsContainer.innerHTML = html;
  } catch (e) {
  console.error('載入專案失敗:', e.message, e.code, e);  // 詳細錯誤日誌
  let errorMsg = '載入失敗，請檢查網路或權限';
  if (e.code === 'permission-denied') {
    errorMsg = '權限不足，請確認規則設定';
  } else if (e.code === 'unavailable') {
    errorMsg = '網路問題，請重試';
  }
  projectsContainer.innerHTML = `<p class="text-danger">${errorMsg}</p>`;
}
}

// --------- Replace WORKFLOW_DETAIL with explicit executor/confirmer ---------
const WORKFLOW_DETAIL = {
  uploaded:    { label: "客戶傳估價檔", executor: "customer", confirmer: "admin" },
  dfm:         { label: "PN進行DFM",     executor: "admin",    confirmer: "customer" }, // <-- DFM 確認方改為 "註冊 mail domain"
  quoted:      { label: "PN完成報價",     executor: "admin",    confirmer: "customer" },
  po_received: { label: "客戶下單",       executor: "customer", confirmer: "admin" },    // <-- 下單的確認方改為 PROTNUT (admin)
  prototyping: { label: "PN試樣",       executor: "admin",    confirmer: "admin" },
  delivery:    { label: "交付產品與報告", executor: "admin",    confirmer: "customer" }
};

// ================ 顯示專案（含流程表） ===================
window.viewProject = async function(projectId){
  const snap = await db.collection('projects').doc(projectId).get();
  if(!snap.exists){ alert('找不到案件'); return; }
  const d = snap.data();
  // 移除 title 後方的狀態顯示（依需求：不要顯示 "專案名稱 — 任務名稱"）
  let html = `<h4>${d.title}</h4>`;

  html += renderWorkflowTable(projectId, d, d.steps || {}, d.attachments || []);

  // 歷史紀錄
  html += '<h5>歷史紀錄</h5><ul>';
  (d.history||[]).forEach(h=>{
    const time = h.ts ? new Date(h.ts).toLocaleString() : '';
    const byDomain = h.by ? getDomainFromEmail(h.by) : '';
    const timeFormatted = h.ts ? new Date(h.ts).toLocaleString('zh-TW', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false
    }).replace(/\//g,'/').replace(',','') : '';

    html += `<li>${WORKFLOW_LABELS[h.status] || h.status} / ${byDomain} / ${h.by||''} / ${timeFormatted}</li>`;
  });
  html += '</ul>';

  document.getElementById('projects-container').innerHTML = html;
    show(projectsList);
    // 新增：綁定「更多/收起」功能
    setupRemarkToggle();
};


// ================ 任務完成 ===================
window.completeTask = async function(pid, status){
  const docRef = db.collection('projects').doc(pid);
  const snap = await docRef.get();
  if(!snap.exists) return;
  const d = snap.data();
  const next = nextStatus(status);

  await docRef.update({
    status: next,
    history: firebase.firestore.FieldValue.arrayUnion({
      status: next,
      by: auth.currentUser.email,
      ts: Date.now(),
      note: '任務完成，自動進入下一階段'
    }),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  });

  await db.collection('notifications').add({
    type: 'task_completed',
    projectId: pid,
    completed: status,
    next: next,
    by: auth.currentUser.email,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    status: 'unread'
  });

  alert(`已完成「${WORKFLOW_LABELS[status]}」，進入「${WORKFLOW_LABELS[next]}」`);
  viewProject(pid);
};

window.uploadPO = async function(projectId){
  const f = document.getElementById(`po-file-${projectId}`).files[0];
  if(!f) { alert('請選擇檔案'); return; }
  try{
    const uid = auth.currentUser.uid;
    const path = `user_uploads/${uid}/projects/${projectId}/po_${Date.now()}_${f.name}`;
    const storageRef = storage.ref().child(path);
    await storageRef.put(f);
    const url = await storageRef.getDownloadURL();
    await db.collection('projects').doc(projectId).update({
      attachments: firebase.firestore.FieldValue.arrayUnion({
          name: f.name,
          storagePath: path,
          downloadUrl: url,
          type: type,
          step: (type === 'quotation' ? 'quoted' : 'dfm'),  // ⬅️ 加這行
          uploadedBy: auth.currentUser.email,
          uploadedAt: Date.now()
        }),
      status: nextStatus('po_received'),
      history: firebase.firestore.FieldValue.arrayUnion({
        status: 'po_received',
        by: auth.currentUser.email,
        ts: Date.now(),
        note: '客戶上傳 PO'
      }),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    await db.collection('notifications').add({
      type: 'po_uploaded',
      projectId: projectId,
      ownerEmail: auth.currentUser.email,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      status: 'unread'
    });
    alert('PO 已上傳');
    loadMyProjects();
  }catch(e){ alert('PO 上傳失敗: '+e.message); }
};

// ================ Admin functions ===================
async function loadPendingUsers(){
  pendingList.innerHTML = '讀取中...';
  const q = await db.collection('users').where('approved','==',false).get();
  if(q.empty){ pendingList.innerHTML = '<i>無待審核帳號</i>'; return; }
  pendingList.innerHTML = '';
  q.forEach(doc=>{
    const d = doc.data(); const id = doc.id;
    const div = document.createElement('div'); div.className='card';
    div.innerHTML = `${d.email} <button onclick="approveUser('${id}')">核准</button>`;
    pendingList.appendChild(div);
  });
}
window.approveUser = async function(uid){
  if(!confirm('確定要核准嗎？')) return;
  await db.collection('users').doc(uid).update({ approved: true, role: 'customer', approvedAt: Date.now() });
  await db.collection('notifications').add({
    type: 'approved_user',
    uid: uid,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    status: 'unread'
  });
  alert('已核准');
  loadPendingUsers();
  loadAllProjectsForAdmin();
};

async function loadAllProjectsForAdmin(){
  adminProjects.innerHTML = '讀取中...';
  const q = await db.collection('projects').orderBy('createdAt','desc').limit(100).get();
  if(q.empty){ adminProjects.innerHTML = '<i>無案件</i>'; return; }
  adminProjects.innerHTML = '';
  q.forEach(doc=>{
    const d = doc.data(); const id = doc.id;
    const div = document.createElement('div'); div.className='card';
    div.innerHTML = `<strong>${d.title}</strong><br>Owner: ${d.owner}<br>Status: ${WORKFLOW_LABELS[d.status] || d.status}
      <br><button onclick="adminViewProject('${id}')">檢視 / 上傳報價 / 改狀態</button>`;
    adminProjects.appendChild(div);
  });
}

// 新增: admin手動加用戶（給非允許域名）
window.adminAddUser = async function(email, pw) {
  if (!isAdmin(auth.currentUser.email)) { alert('僅管理員可操作'); return; }
  try {
    const cred = await auth.createUserWithEmailAndPassword(email, pw);
    await db.collection('users').doc(cred.user.uid).set({
      email: email, approved: true, role: 'customer', createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    alert('用戶已手動加入');
  } catch (e) { alert('失敗: ' + e.message); }
};

window.adminViewProject = async function(pid){
  const doc = await db.collection('projects').doc(pid).get();
  if(!doc.exists){ alert('找不到'); return; }
  const d = doc.data();

  // ✅ 改成用 renderWorkflowTable
  let html = `<h4>${d.title}</h4>`;
  html += renderWorkflowTable(pid, d, d.steps || {}, d.attachments || []);

  // 歷史紀錄（跟 viewProject 一樣）
  html += '<h5>歷史紀錄</h5><ul>';
  (d.history||[]).forEach(h=>{
    const timeFormatted = h.ts ? new Date(h.ts).toLocaleString('zh-TW', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false
    }).replace(/\//g,'/').replace(',','') : '';
    const byDomain = h.by ? getDomainFromEmail(h.by) : '';
    html += `<li>${WORKFLOW_LABELS[h.status] || h.status} / ${byDomain} / ${h.by||''} / ${timeFormatted}</li>`;
  });
  html += '</ul>';

  document.getElementById('admin-projects').innerHTML = html;
    setupRemarkToggle();
};


window.adminUpload = async function(pid){
  const f = document.getElementById('admin-file').files[0];
  const type = document.getElementById('admin-new-type').value;
  if(!f){ alert('請選檔案'); return; }
  const path = `admin_uploads/${pid}/${Date.now()}_${f.name}`;
  const storageRef = storage.ref().child(path);
  await storageRef.put(f);
  const url = await storageRef.getDownloadURL();

  const updateObj = {
    attachments: firebase.firestore.FieldValue.arrayUnion({
      name: f.name, storagePath: path, downloadUrl: url, type: type,
      uploadedBy: auth.currentUser.email, uploadedAt: Date.now()
    }),
    history: firebase.firestore.FieldValue.arrayUnion({
      status: type, by: auth.currentUser.email, ts: Date.now(), note: '管理員上傳'
    }),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  };
  if(type === 'quotation'){
      updateObj[`steps.quoted.status`] = 'in_progress';
      if(d.status !== 'quoted'){   // 避免覆蓋客戶已推進的狀態
        updateObj.status = 'quoted';
      }
    }
  await db.collection('projects').doc(pid).update(updateObj);

  await db.collection('notifications').add({
    type: type === 'quotation' ? 'quote_uploaded' : 'report_uploaded',
    projectId: pid,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    status: 'unread'
  });
  alert('上傳完成');
  loadAllProjectsForAdmin();
};

window.adminSetStatus = async function(pid){
  const s = document.getElementById('admin-set-status').value;
  await db.collection('projects').doc(pid).update({
    status: s,
    history: firebase.firestore.FieldValue.arrayUnion({
      status: s, by: auth.currentUser.email, ts: Date.now(), note: '管理員手動設置'
    }),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  alert('狀態已更新');
  loadAllProjectsForAdmin();
};

// ================ Notifications ===================
async function loadNotificationsForAdmin(){
  if(!notificationsContainer) return;
  const q = await db.collection('notifications').where('status','==','unread').orderBy('createdAt','desc').get();
  if(q.empty){ notificationsContainer.innerHTML = '<i>無新通知</i>'; return; }
  let html = '';
  q.forEach(doc=>{
    const d = doc.data();
    html += `<div class="card">${d.type} - ${d.email || d.ownerEmail || d.projectId || ''} - ${d.createdAt && d.createdAt.toDate ? d.createdAt.toDate().toLocaleString() : ''} <button onclick="markNotificationRead('${doc.id}')">標示已讀</button></div>`;
  });
  notificationsContainer.innerHTML = html;
}
window.markNotificationRead = async function(nid){
  await db.collection('notifications').doc(nid).update({ status: 'read', readAt: Date.now() });
  loadNotificationsForAdmin();
};