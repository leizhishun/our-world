// ============ 全局状态 ============
let appState = {
    currentPerson: 'A',
    currentPage: 'home',
    selectedMood: null,
    focusTimer: null,
    focusSeconds: 1500, // 25分钟
    focusRunning: false,
    totalFocusTime: 0,
    totalPomodoros: 0,
    quizIndex: 0,
    challengeQuestions: [],
    cloudReady: false,        // 云端是否就绪
    isSaving: false,           // 防止并发保存
    lastSyncTime: null,        // 上次同步时间
    togetherStartTime: null    // 在一起计时开始时间（ISO字符串）
};

// ============ 数据存储 ============
const DB = {
    togetherStartTime: null,  // 在一起计时开始时间（ISO字符串）
    anniversaries: [],
    diaries: [],
    photos: [],
    milestones: [],
    classes: [],
    events: [],
    tasks: [],
    wishes: [],
    savings: [],
    savingsGoal: 5000,
    moods: {},
    secrets: [],
    checkins: [],
    favorites: [],
    rewards: [],
    rants: []
};

// ============ 默认数据 ============
function getDefaultData() {
    return {
        anniversaries: [],
        milestones: [],
        diaries: [],
        photos: [],
        classes: [],
        events: [],
        tasks: [],
        wishes: [],
        savings: [],
        savingsGoal: 5000,
        moods: {},
        secrets: [],
        checkins: [],
        favorites: [],
        rewards: [],
        rants: []
    };
}

// ============ Bmob 云端同步 ============
const DATA_KEY = 'main';  // 数据标识字段

// 保存的 objectId（首次创建后缓存，后续直接更新）
let savedObjectId = localStorage.getItem('bmob_object_id') || null;

// 初始化数据
async function loadFromCloud() {
    try {
        const query = Bmob.Query(BM_TABLE.APP_DATA);
        query.equalTo('dataKey', DATA_KEY);
        query.limit(1);
        const results = await query.find();

        if (results.length > 0) {
            const cloudData = results[0].jsonData;
            if (cloudData) {
                Object.assign(DB, JSON.parse(cloudData));
                localStorage.setItem('coupleAppData', cloudData);
                savedObjectId = results[0].objectId;
                localStorage.setItem('bmob_object_id', savedObjectId);
                appState.cloudReady = true;
                console.log('☁️ 数据从云端加载成功');
                return;
            }
        }

        // 云端无数据，检查本地是否有缓存
        const localData = localStorage.getItem('coupleAppData');
        if (localData) {
            Object.assign(DB, JSON.parse(localData));
            saveToCloud();
            console.log('☁️ 本地数据已上传到云端');
        } else {
            Object.assign(DB, getDefaultData());
            saveToCloud();
            console.log('☁️ 首次初始化默认数据到云端');
        }
        appState.cloudReady = true;
    } catch (err) {
        console.warn('⚠️ 云端连接失败，使用本地缓存:', err.message);
        const localData = localStorage.getItem('coupleAppData');
        if (localData) {
            Object.assign(DB, JSON.parse(localData));
        } else {
            Object.assign(DB, getDefaultData());
        }
    }
}

// 保存到云端（带防抖）
let saveTimeout = null;
function saveToCloud() {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
        try {
            if (appState.isSaving) return;
            appState.isSaving = true;

            const jsonData = JSON.stringify(DB);
            localStorage.setItem('coupleAppData', jsonData);

            if (savedObjectId) {
                // 更新已有记录
                const query = Bmob.Query(BM_TABLE.APP_DATA);
                query.get(savedObjectId).then(obj => {
                    obj.set('jsonData', jsonData);
                    obj.set('updatedAt', new Date().toISOString());
                    return obj.save();
                }).then(() => {
                    appState.lastSyncTime = new Date();
                    console.log('☁️ 数据已同步到云端');
                }).catch(err => {
                    // objectId 失效（比如云端被清除），重新创建
                    console.warn('⚠️ 更新失败，重新创建:', err.message);
                    savedObjectId = null;
                    localStorage.removeItem('bmob_object_id');
                    createNewRecord(jsonData);
                });
            } else {
                createNewRecord(jsonData);
            }
        } catch (err) {
            console.warn('⚠️ 云端保存失败:', err.message);
        } finally {
            appState.isSaving = false;
        }
    }, 500);
}

// 创建新云端记录
function createNewRecord(jsonData) {
    const query = Bmob.Query(BM_TABLE.APP_DATA);
    query.set('dataKey', DATA_KEY);
    query.set('jsonData', jsonData);
    query.save().then(res => {
        savedObjectId = res.objectId;
        localStorage.setItem('bmob_object_id', savedObjectId);
        appState.lastSyncTime = new Date();
        console.log('☁️ 数据已同步到云端（新建）');
    }).catch(err => {
        console.warn('⚠️ 云端创建失败:', err.message);
    });
}

// 监听云端数据变化（实时同步）
function startCloudSync() {
    try {
        // 订阅表更新事件
        BmobSocketIo.updateTable(BM_TABLE.APP_DATA);

        // 监听表中任何行的更新
        BmobSocketIo.onUpdateTable = function(tablename, data) {
            if (tablename === BM_TABLE.APP_DATA && data && data.jsonData) {
                const newData = data.jsonData;
                if (typeof newData === 'string' ? newData : JSON.stringify(newData)) {
                    const jsonStr = typeof newData === 'string' ? newData : JSON.stringify(newData);
                    // 检查是否有变化
                    if (JSON.stringify(DB) !== jsonStr) {
                        const parsed = typeof newData === 'string' ? JSON.parse(newData) : newData;
                        Object.assign(DB, parsed);
                        localStorage.setItem('coupleAppData', jsonStr);
                        // 更新 objectId
                        if (data.objectId) {
                            savedObjectId = data.objectId;
                            localStorage.setItem('bmob_object_id', savedObjectId);
                        }
                        renderAllSections();
                        console.log('🔄 检测到TA更新了数据，已自动刷新');
                        showToast('TA更新了数据，已自动刷新~');
                    }
                }
            }
        };

        console.log('🌐 实时同步已开启');
    } catch (err) {
        console.warn('⚠️ 实时同步功能不可用:', err.message);
    }
}

// Toast 提示（替代 alert）
function showToast(message) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// ============ 初始化 ============
document.addEventListener('DOMContentLoaded', async () => {
    // 显示加载状态
    document.body.style.opacity = '0.7';

    await loadFromCloud();

    initNavigation();
    initTimerDisplay();
    setInterval(updateCountdown, 1000);
    renderAllSections();
    initDateInputs();
    initFocusTimer();

    // 开启实时同步
    startCloudSync();

    // 恢复显示
    document.body.style.opacity = '1';
    showToast('💕 数据加载完成');
});

// ============ 兼容性别名（原有函数名保持不变） ============
function saveToLocalStorage() {
    saveToCloud();
}

function loadFromLocalStorage() {
    // 已在 loadFromCloud 中处理
}

// ============ 导航 ============
function initNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const page = item.getAttribute('data-page');
            navigateTo(page);
        });
    });
}

function navigateTo(page) {
    appState.currentPage = page;
    
    // 更新导航激活状态
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
        if (item.getAttribute('data-page') === page) {
            item.classList.add('active');
        }
    });

    // 更新底部移动导航激活状态
    document.querySelectorAll('.mobile-nav-item').forEach(item => {
        item.classList.remove('active');
        if (item.getAttribute('data-page') === page) {
            item.classList.add('active');
        }
    });

    // 关闭移动端菜单
    const navMenu = document.getElementById('navMenu');
    const hamburger = document.getElementById('navHamburger');
    if (navMenu) navMenu.classList.remove('open');
    if (hamburger) hamburger.classList.remove('open');
    
    // 显示对应页面
    document.querySelectorAll('.page').forEach(p => {
        p.classList.remove('active');
    });
    
    const targetPage = document.getElementById(page);
    if (targetPage) {
        targetPage.classList.add('active');
    }
    
    // 渲染对应页面内容
    renderPageContent(page);
}

function renderPageContent(page) {
    switch(page) {
        case 'home':
            renderReminders();
            break;
        case 'anniversary':
            renderAnniversaries();
            break;
        case 'diary':
            renderDiaries();
            break;
        case 'gallery':
            renderGallery();
            break;
        case 'timeline':
            renderTimeline();
            break;
        case 'schedule':
            renderSchedule();
            break;
        case 'calendar':
            renderCalendar();
            break;
        case 'tasks':
            renderTasks();
            break;
        case 'wishlist':
            renderWishlist();
            break;
        case 'checkin':
            renderCheckins();
            break;
        case 'favorites':
            renderFavorites();
            break;
        case 'rewards':
            renderRewards();
            break;
        case 'savings':
            renderSavings();
            break;
        case 'mood':
            renderMoodCalendar();
            break;
        case 'rant':
            renderRants();
            break;
    }
}

function renderAllSections() {
    renderReminders();
    renderAnniversaries();
    renderDiaries();
    renderGallery();
    renderTimeline();
    renderSchedule();
    renderCalendar();
    renderTasks();
    renderWishlist();
    renderCheckins();
    renderFavorites();
    renderRewards();
    renderSavings();
    renderMoodCalendar();
}

// ============ 首页 ============

// 开启在一起计时（只能点一次）
function startTogetherTimer() {
    // 二次确认
    if (!confirm('💕 开启后将不可撤销，确认开始计时吗？')) return;

    const now = new Date().toISOString();
    appState.togetherStartTime = now;
    DB.togetherStartTime = now;

    // 立即保存到云端
    saveToCloud();

    // 切换显示
    document.getElementById('timerNotStarted').style.display = 'none';
    document.getElementById('timerStarted').style.display = 'block';

    showToast('💕 计时已开启，每一秒都是爱～');
}

// 初始化计时器状态（页面加载时调用）
function initTimerDisplay() {
    const startTime = DB.togetherStartTime;
    if (startTime) {
        // 已经开启过计时
        appState.togetherStartTime = startTime;
        document.getElementById('timerNotStarted').style.display = 'none';
        document.getElementById('timerStarted').style.display = 'block';
    } else {
        // 还没开启
        document.getElementById('timerNotStarted').style.display = 'block';
        document.getElementById('timerStarted').style.display = 'none';
    }
    updateCountdown();
}

function updateCountdown() {
    const startTime = appState.togetherStartTime;
    if (!startTime) return;

    const now = new Date();
    const start = new Date(startTime);
    const diff = now - start;

    if (diff < 0) return;

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    const daysEl = document.getElementById('days');
    const hoursEl = document.getElementById('hours');
    const minutesEl = document.getElementById('minutes');
    const secondsEl = document.getElementById('seconds');

    if (daysEl) daysEl.textContent = days;
    if (hoursEl) hoursEl.textContent = hours;
    if (minutesEl) minutesEl.textContent = minutes;
    if (secondsEl) secondsEl.textContent = seconds;

    // 显示开始日期
    const startDateEl = document.getElementById('timerStartDate');
    if (startDateEl) {
        const d = new Date(startTime);
        startDateEl.textContent = `始于 ${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
    }
}

function renderReminders() {
    const reminderList = document.getElementById('reminderList');
    const upcomingAnniversaries = DB.anniversaries
        .map(ann => {
            const today = new Date();
            const annDate = new Date(ann.date);
            annDate.setFullYear(today.getFullYear());
            if (annDate < today) {
                annDate.setFullYear(today.getFullYear() + 1);
            }
            const diff = Math.ceil((annDate - today) / (1000 * 60 * 60 * 24));
            return { ...ann, daysLeft: diff };
        })
        .filter(ann => ann.daysLeft <= 30)
        .sort((a, b) => a.daysLeft - b.daysLeft)
        .slice(0, 3);
    
    if (upcomingAnniversaries.length === 0) {
        reminderList.innerHTML = '<div class="reminder-item"><span class="reminder-text">近期没有重要纪念日</span></div>';
        return;
    }
    
    reminderList.innerHTML = upcomingAnniversaries.map(ann => `
        <div class="reminder-item">
            <span class="reminder-icon">${ann.type === 'birthday' ? '🎂' : '💕'}</span>
            <span class="reminder-text">${ann.title}还有 ${ann.daysLeft} 天</span>
        </div>
    `).join('');
}

// ============ 纪念日 ============
function renderAnniversaries() {
    const list = document.getElementById('anniversaryList');
    if (DB.anniversaries.length === 0) {
        list.innerHTML = '<div class="empty-state">还没有纪念日，点击上方按钮添加</div>';
        return;
    }
    
    list.innerHTML = DB.anniversaries.map(ann => {
        const today = new Date();
        const annDate = new Date(ann.date);
        annDate.setFullYear(today.getFullYear());
        if (annDate < today) {
            annDate.setFullYear(today.getFullYear() + 1);
        }
        const daysLeft = Math.ceil((annDate - today) / (1000 * 60 * 60 * 24));
        
        return `
            <div class="anniversary-card">
                <div class="anniversary-info">
                    <h4>${ann.type === 'birthday' ? '🎂' : '💕'} ${ann.title}</h4>
                    <div class="anniversary-date">${ann.date}</div>
                </div>
                <div class="anniversary-actions">
                    <div class="anniversary-countdown">
                        <div class="countdown-days">${daysLeft}</div>
                        <div class="countdown-label">天后</div>
                    </div>
                    <button class="delete-btn" onclick="deleteAnniversary(${ann.id})" title="删除">✕</button>
                </div>
            </div>
        `;
    }).join('');
}

function showAddAnniversary() {
    document.getElementById('anniversaryModal').classList.add('active');
}

function saveAnniversary() {
    const title = document.getElementById('annTitle').value;
    const date = document.getElementById('annDate').value;
    const type = document.getElementById('annType').value;
    const repeat = document.getElementById('annRepeat').checked;
    
    if (!title || !date) {
        alert('请填写完整信息');
        return;
    }
    
    DB.anniversaries.push({
        id: Date.now(),
        title,
        date,
        type,
        repeat
    });
    
    saveToLocalStorage();
    renderAnniversaries();
    renderReminders();
    closeModal('anniversaryModal');
    
    // 清空表单
    document.getElementById('annTitle').value = '';
    document.getElementById('annDate').value = '';
}

function deleteAnniversary(id) {
    if (!confirm('确定要删除这个纪念日吗？')) return;
    DB.anniversaries = DB.anniversaries.filter(a => a.id !== id);
    saveToCloud();
    renderAnniversaries();
    renderReminders();
    showToast('已删除纪念日');
}

// ============ 日记 ============
function renderDiaries() {
    const list = document.getElementById('diaryList');
    if (DB.diaries.length === 0) {
        list.innerHTML = '<div class="empty-state">还没有日记，点击上方按钮开始记录</div>';
        return;
    }
    
    const sortedDiaries = [...DB.diaries].sort((a, b) => new Date(b.date) - new Date(a.date));
    
    list.innerHTML = sortedDiaries.map(diary => `
        <div class="diary-card">
            <div class="diary-header">
                <div class="diary-date">${diary.date}</div>
                <div class="diary-mood">${getMoodEmoji(diary.mood)}</div>
            </div>
            <div class="diary-content">${diary.content}</div>
            <div class="diary-tags">
                ${diary.tags.map(tag => `<span class="diary-tag">#${tag}</span>`).join('')}
            </div>
        </div>
    `).join('');
}

function showAddDiary() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('diaryDate').value = today;
    document.getElementById('diaryModal').classList.add('active');
}

function saveDiary() {
    const date = document.getElementById('diaryDate').value;
    const content = document.getElementById('diaryContent').value;
    const mood = appState.selectedMood;
    const tags = document.getElementById('diaryTags').value.split(',').map(t => t.trim()).filter(t => t);
    
    if (!content) {
        alert('请填写日记内容');
        return;
    }
    
    DB.diaries.push({ id: Date.now(), date, content, mood, tags });
    saveToLocalStorage();
    renderDiaries();
    closeModal('diaryModal');
    
    // 清空表单
    document.getElementById('diaryContent').value = '';
    document.getElementById('diaryTags').value = '';
    appState.selectedMood = null;
    document.querySelectorAll('.mood-option').forEach(o => o.classList.remove('selected'));
}

function getMoodEmoji(mood) {
    const emojiMap = {
        happy: '😄',
        sad: '😢',
        angry: '😠',
        love: '😍',
        surprised: '😲'
    };
    return emojiMap[mood] || '😊';
}

// ============ 相册 ============
function renderGallery() {
    const grid = document.getElementById('galleryGrid');
    if (DB.photos.length === 0) {
        grid.innerHTML = '<div class="empty-state">还没有照片，点击上方按钮添加</div>';
        return;
    }
    
    const sortedPhotos = [...DB.photos].sort((a, b) => new Date(b.date) - new Date(a.date));
    
    grid.innerHTML = sortedPhotos.map(photo => `
        <div class="photo-card">
            <div class="photo-image" style="background-image: url('${photo.url}')"></div>
            <div class="photo-info">
                <div class="photo-title">${photo.title}</div>
                <div class="photo-date">${photo.date}</div>
            </div>
        </div>
    `).join('');
}

function showAddPhoto() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('photoDate').value = today;
    document.getElementById('photoModal').classList.add('active');
}

function savePhoto() {
    const title = document.getElementById('photoTitle').value;
    const date = document.getElementById('photoDate').value;
    const category = document.getElementById('photoCategory').value;
    const url = document.getElementById('photoUrl').value;
    
    if (!title || !url) {
        alert('请填写完整信息');
        return;
    }
    
    DB.photos.push({ id: Date.now(), title, date, category, url });
    saveToLocalStorage();
    renderGallery();
    closeModal('photoModal');
    
    // 清空表单
    document.getElementById('photoTitle').value = '';
    document.getElementById('photoUrl').value = '';
}

// ============ 时间轴 ============
function renderTimeline() {
    const container = document.getElementById('timelineContainer');
    if (DB.milestones.length === 0) {
        container.innerHTML = '<div class="empty-state">还没有里程碑，点击上方按钮添加</div>';
        return;
    }
    
    const sortedMilestones = [...DB.milestones].sort((a, b) => new Date(b.date) - new Date(a.date));
    
    container.innerHTML = sortedMilestones.map(ms => `
        <div class="milestone-item">
            <div class="milestone-dot"></div>
            <div class="milestone-card">
                <button class="delete-btn milestone-delete" onclick="deleteMilestone(${ms.id})" title="删除">✕</button>
                <div class="milestone-icon">${ms.icon}</div>
                <div class="milestone-title">${ms.title}</div>
                <div class="milestone-date">${ms.date}</div>
                <div class="milestone-desc">${ms.desc || ''}</div>
            </div>
        </div>
    `).join('');
}

function showAddMilestone() {
    document.getElementById('milestoneModal').classList.add('active');
}

function saveMilestone() {
    const title = document.getElementById('milestoneTitle').value;
    const date = document.getElementById('milestoneDate').value;
    const desc = document.getElementById('milestoneDesc').value;
    const icon = document.getElementById('milestoneIcon').value;
    
    if (!title || !date) {
        alert('请填写完整信息');
        return;
    }
    
    DB.milestones.push({ id: Date.now(), title, date, desc, icon });
    saveToLocalStorage();
    renderTimeline();
    closeModal('milestoneModal');
    
    // 清空表单
    document.getElementById('milestoneTitle').value = '';
    document.getElementById('milestoneDate').value = '';
    document.getElementById('milestoneDesc').value = '';
}

function deleteMilestone(id) {
    if (!confirm('确定要删除这条里程碑吗？')) return;
    DB.milestones = DB.milestones.filter(m => m.id !== id);
    saveToCloud();
    renderTimeline();
    showToast('已删除里程碑');
}

// ============ 课表 ============
function renderSchedule() {
    const grid = document.getElementById('scheduleGrid');
    const person = appState.currentPerson;
    
    const days = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'];
    const times = ['1-2节', '3-4节', '5-6节', '7-8节', '9-10节'];
    
    let html = '<table class="schedule-table"><thead><tr><th>时间</th>';
    days.slice(1).forEach(day => {
        html += `<th>${day}</th>`;
    });
    html += '</tr></thead><tbody>';
    
    times.forEach((time, timeIndex) => {
        html += `<tr><td>${time}</td>`;
        for (let day = 1; day <= 7; day++) {
            const classes = DB.classes.filter(c => 
                c.person === person && 
                parseInt(c.day) === day && 
                parseInt(c.time) === timeIndex + 1
            );
            
            if (classes.length > 0) {
                html += `<td><div class="class-cell">
                    <div class="class-name">${classes[0].name}</div>
                    <div class="class-room">${classes[0].room || ''}</div>
                </div></td>`;
            } else {
                html += '<td></td>';
            }
        }
        html += '</tr>';
    });
    
    html += '</tbody></table>';
    grid.innerHTML = html;
}

function showAddClass() {
    document.getElementById('classModal').classList.add('active');
}

function saveClass() {
    const name = document.getElementById('className').value;
    const day = document.getElementById('classDay').value;
    const time = document.getElementById('classTime').value;
    const person = document.getElementById('classPerson').value;
    const room = document.getElementById('classRoom').value;
    
    if (!name) {
        alert('请填写课程名称');
        return;
    }
    
    DB.classes.push({ id: Date.now(), name, day, time, person, room });
    saveToLocalStorage();
    renderSchedule();
    closeModal('classModal');
    
    // 清空表单
    document.getElementById('className').value = '';
    document.getElementById('classRoom').value = '';
}

// 课表切换
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        appState.currentPerson = btn.dataset.person;
        renderSchedule();
    });
});

// ============ 日历 ============
let currentCalendarDate = new Date();

function renderCalendar() {
    const grid = document.getElementById('calendarGrid');
    const monthNames = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
    
    document.getElementById('calendarMonth').textContent = `${currentCalendarDate.getFullYear()}年 ${monthNames[currentCalendarDate.getMonth()]}`;
    
    const firstDay = new Date(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth(), 1);
    const lastDay = new Date(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth() + 1, 0);
    const startDay = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
    const totalDays = lastDay.getDate();
    
    const today = new Date();
    const isCurrentMonth = today.getFullYear() === currentCalendarDate.getFullYear() && 
                          today.getMonth() === currentCalendarDate.getMonth();
    
    let html = '';
    
    // 空白天
    for (let i = 0; i < startDay; i++) {
        html += '<div class="calendar-day disabled"></div>';
    }
    
    // 日期
    for (let day = 1; day <= totalDays; day++) {
        const dateStr = `${currentCalendarDate.getFullYear()}-${String(currentCalendarDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const dayEvents = DB.events.filter(e => e.date === dateStr);
        const isToday = isCurrentMonth && day === today.getDate();
        
        html += `
            <div class="calendar-day ${isToday ? 'today' : ''} ${dayEvents.length > 0 ? 'has-event' : ''}" 
                 onclick="showDayEvents('${dateStr}')">
                <div class="day-number">${day}</div>
                ${dayEvents.length > 0 ? `<div class="day-events">${dayEvents.length}个事件</div>` : ''}
            </div>
        `;
    }
    
    grid.innerHTML = html;
}

function changeMonth(delta) {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() + delta);
    renderCalendar();
}

function showAddEvent() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('eventDate').value = today;
    document.getElementById('eventModal').classList.add('active');
}

function saveEvent() {
    const name = document.getElementById('eventName').value;
    const date = document.getElementById('eventDate').value;
    const type = document.getElementById('eventType').value;
    const note = document.getElementById('eventNote').value;
    
    if (!name || !date) {
        alert('请填写完整信息');
        return;
    }
    
    DB.events.push({ id: Date.now(), name, date, type, note });
    saveToLocalStorage();
    renderCalendar();
    closeModal('eventModal');
    
    // 清空表单
    document.getElementById('eventName').value = '';
    document.getElementById('eventNote').value = '';
}

// ============ 任务 ============
function renderTasks() {
    const list = document.getElementById('taskList');
    if (DB.tasks.length === 0) {
        list.innerHTML = '<div class="empty-state">还没有任务，点击上方按钮添加</div>';
        return;
    }
    
    list.innerHTML = DB.tasks.map(task => `
        <div class="task-card ${task.completed ? 'completed' : ''}">
            <div class="task-checkbox ${task.completed ? 'checked' : ''}" 
                 onclick="toggleTask(${task.id})"></div>
            <div class="task-content">
                <div class="task-title">${task.title}</div>
                <div class="task-meta">
                    <span>截止: ${task.deadline}</span>
                    <span class="priority-${task.priority}">${getPriorityLabel(task.priority)}</span>
                </div>
            </div>
        </div>
    `).join('');
}

function showAddTask() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('taskDeadline').value = today;
    document.getElementById('taskModal').classList.add('active');
}

function saveTask() {
    const title = document.getElementById('taskTitle').value;
    const deadline = document.getElementById('taskDeadline').value;
    const priority = document.getElementById('taskPriority').value;
    const tags = document.getElementById('taskTags').value.split(',').map(t => t.trim()).filter(t => t);
    
    if (!title) {
        alert('请填写任务名称');
        return;
    }
    
    DB.tasks.push({ id: Date.now(), title, deadline, priority, tags, completed: false });
    saveToLocalStorage();
    renderTasks();
    closeModal('taskModal');
    
    // 清空表单
    document.getElementById('taskTitle').value = '';
    document.getElementById('taskTags').value = '';
}

function toggleTask(id) {
    const task = DB.tasks.find(t => t.id === id);
    if (task) {
        task.completed = !task.completed;
        saveToLocalStorage();
        renderTasks();
    }
}

function getPriorityLabel(priority) {
    const labels = { low: '低', medium: '中', high: '高' };
    return labels[priority] || '';
}

// 任务筛选
document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        // 这里可以添加筛选逻辑
    });
});

// ============ 专注计时器 ============
function initFocusTimer() {
    updateFocusDisplay();
}

function startFocus() {
    if (appState.focusRunning) return;
    
    appState.focusRunning = true;
    document.getElementById('focusStatus').textContent = '专注中...';
    
    appState.focusTimer = setInterval(() => {
        if (appState.focusSeconds > 0) {
            appState.focusSeconds--;
            updateFocusDisplay();
            appState.totalFocusTime++;
            document.getElementById('totalFocusTime').textContent = Math.floor(appState.totalFocusTime / 60);
        } else {
            completeFocus();
        }
    }, 1000);
}

function pauseFocus() {
    appState.focusRunning = false;
    clearInterval(appState.focusTimer);
    document.getElementById('focusStatus').textContent = '已暂停';
}

function resetFocus() {
    pauseFocus();
    appState.focusSeconds = 1500;
    updateFocusDisplay();
    document.getElementById('focusStatus').textContent = '准备开始';
}

function completeFocus() {
    pauseFocus();
    appState.totalPomodoros++;
    document.getElementById('totalPomodoros').textContent = appState.totalPomodoros;
    document.getElementById('focusStatus').textContent = '完成！休息一下吧';
    appState.focusSeconds = 1500;
    updateFocusDisplay();
    
    // 添加到历史记录
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const historyList = document.querySelector('#focusHistory .history-list');
    const newItem = document.createElement('div');
    newItem.className = 'history-item';
    newItem.innerHTML = `<span>${timeStr}</span><span>✅ 完成</span>`;
    historyList.insertBefore(newItem, historyList.firstChild);
}

function updateFocusDisplay() {
    const minutes = Math.floor(appState.focusSeconds / 60);
    const seconds = appState.focusSeconds % 60;
    document.getElementById('focusTimer').textContent = 
        `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

// ============ 愿望清单 ============
function renderWishlist() {
    const list = document.getElementById('wishList');
    if (DB.wishes.length === 0) {
        list.innerHTML = '<div class="empty-state">还没有愿望，点击上方按钮添加</div>';
        return;
    }
    
    list.innerHTML = DB.wishes.map(wish => `
        <div class="wish-card ${wish.completed ? 'completed' : ''}">
            <div class="wish-icon">${getWishIcon(wish.category)}</div>
            <div class="wish-content">
                <div class="wish-title">${wish.content}</div>
                <div class="wish-meta">
                    <span>${getCategoryLabel(wish.category)}</span>
                    <span>${getDifficultyLabel(wish.difficulty)}</span>
                </div>
            </div>
            <div class="wish-checkbox ${wish.completed ? 'checked' : ''}" 
                 onclick="toggleWish(${wish.id})"></div>
        </div>
    `).join('');
}

function showAddWish() {
    document.getElementById('wishModal').classList.add('active');
}

function saveWish() {
    const content = document.getElementById('wishContent').value;
    const category = document.getElementById('wishCategory').value;
    const difficulty = document.getElementById('wishDifficulty').value;
    
    if (!content) {
        alert('请填写愿望内容');
        return;
    }
    
    DB.wishes.push({ id: Date.now(), content, category, difficulty, completed: false });
    saveToLocalStorage();
    renderWishlist();
    closeModal('wishModal');
    
    // 清空表单
    document.getElementById('wishContent').value = '';
}

function toggleWish(id) {
    const wish = DB.wishes.find(w => w.id === id);
    if (wish) {
        wish.completed = !wish.completed;
        saveToLocalStorage();
        renderWishlist();
    }
}

function getWishIcon(category) {
    const icons = {
        restaurant: '🍽️',
        movie: '🎬',
        travel: '✈️',
        gift: '🎁',
        other: '⭐'
    };
    return icons[category] || '⭐';
}

function getCategoryLabel(category) {
    const labels = { restaurant: '餐厅', movie: '电影', travel: '旅行', gift: '礼物', other: '其他' };
    return labels[category] || category;
}

function getDifficultyLabel(difficulty) {
    const labels = { easy: '简单 ⭐', medium: '中等 ⭐⭐', hard: '困难 ⭐⭐⭐' };
    return labels[difficulty] || difficulty;
}

// ============ 小金库 ============
function renderSavings() {
    const total = DB.savings.reduce((sum, s) => sum + s.amount, 0);
    const percent = Math.min((total / DB.savingsGoal) * 100, 100);
    
    document.getElementById('totalSavings').textContent = `¥${total.toLocaleString()}`;
    document.getElementById('savingsProgress').querySelector('.progress-fill').style.width = `${percent}%`;
    document.getElementById('savingsPercent').textContent = `${percent.toFixed(1)}%`;
    
    const historyList = document.getElementById('savingsHistory');
    if (DB.savings.length === 0) {
        historyList.innerHTML = '<div class="empty-state">还没有存入记录</div>';
        return;
    }
    
    const sortedSavings = [...DB.savings].sort((a, b) => new Date(b.date) - new Date(a.date));
    historyList.innerHTML = sortedSavings.map(s => `
        <div class="history-item">
            <span>${s.date} ${s.note || ''}</span>
            <span>+¥${s.amount.toLocaleString()}</span>
        </div>
    `).join('');
}

function showAddSavings() {
    document.getElementById('savingsModal').classList.add('active');
}

function saveSavings() {
    const amount = parseFloat(document.getElementById('savingsAmount').value);
    const note = document.getElementById('savingsNote').value;
    
    if (!amount || amount <= 0) {
        alert('请输入有效金额');
        return;
    }
    
    const today = new Date().toISOString().split('T')[0];
    DB.savings.push({ id: Date.now(), amount, note, date: today });
    saveToLocalStorage();
    renderSavings();
    closeModal('savingsModal');
    
    // 清空表单
    document.getElementById('savingsAmount').value = '';
    document.getElementById('savingsNote').value = '';
}

// ============ 心情 ============
function renderMoodCalendar() {
    const calendar = document.getElementById('moodCalendar');
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();
    
    let html = '<div style="text-align:center; margin-bottom:1rem;">';
    html += `<strong>${year}年${month + 1}月</strong></div>`;
    
    html += '<div style="display:grid; grid-template-columns:repeat(7, 1fr); gap:4px;">';
    
    for (let day = 1; day <= today.getDate(); day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const mood = DB.moods[dateStr];
        const isToday = day === today.getDate();
        
        html += `
            <div style="aspect-ratio:1; display:flex; align-items:center; justify-content:center; 
                        border:1px solid #eee; border-radius:4px; font-size:1.25rem;
                        ${isToday ? 'background:#FFB6C1;' : ''}"
                 title="${dateStr}">
                ${mood ? getMoodEmoji(mood) : day}
            </div>
        `;
    }
    
    html += '</div>';
    calendar.innerHTML = html;
}

function selectMood(mood) {
    appState.selectedMood = mood;
    document.querySelectorAll('.mood-option-large').forEach(el => {
        el.classList.toggle('selected', el.dataset.mood === mood);
    });
}

function saveMood() {
    const mood = appState.selectedMood;
    const note = document.getElementById('moodNote').value;
    
    if (!mood) {
        alert('请选择心情');
        return;
    }
    
    const today = new Date().toISOString().split('T')[0];
    DB.moods[today] = { mood, note };
    saveToLocalStorage();
    renderMoodCalendar();
    
    alert('心情已记录！');
    
    // 清空表单
    document.getElementById('moodNote').value = '';
    appState.selectedMood = null;
    document.querySelectorAll('.mood-option-large').forEach(el => el.classList.remove('selected'));
}

// ============ 互动游戏 ============
function showSecretMessage() {
    document.getElementById('secretModal').classList.add('active');
}

function saveSecretMessage() {
    const message = document.getElementById('secretMessage').value;
    const time = document.getElementById('secretTime').value;
    
    if (!message) {
        alert('请填写消息内容');
        return;
    }
    
    DB.secrets.push({
        id: Date.now(),
        message,
        time: time || new Date().toISOString(),
        delivered: false
    });
    
    saveToLocalStorage();
    closeModal('secretModal');
    alert('悄悄话已发送！');
    
    document.getElementById('secretMessage').value = '';
}

const quizQuestions = [
    '你最喜欢的食物是什么？',
    '你最想去哪里旅行？',
    '你觉得我们最相似的地方是什么？',
    '你最想对我说的一句话是什么？',
    '你认为爱情是什么？',
    '你最喜欢的电影是什么？',
    '你最想和我一起做的事是什么？',
    '你觉得我最大的优点是什么？'
];

function showQuiz() {
    document.getElementById('quizModal').classList.add('active');
    nextQuizQuestion();
}

function nextQuizQuestion() {
    if (appState.quizIndex >= quizQuestions.length) {
        appState.quizIndex = 0;
    }
    
    document.getElementById('quizQuestion').textContent = quizQuestions[appState.quizIndex];
    document.getElementById('quizAnswer').value = '';
    appState.quizIndex++;
}

const challengeQuestions = [
    { question: '周末通常想做什么？', options: ['宅家', '出去玩', '学习', '运动'] },
    { question: '最不能忍受对方做什么？', options: ['迟到', '撒谎', '不回消息', '其他'] },
    { question: '理想中的一次约会是？', options: ['看电影', '旅行', '美食', '公园散步'] },
    { question: '你觉得我们最重要的纪念日是？', options: ['在一起日', '第一次约会', '对方生日', '所有都很重要'] }
];

function showChallenge() {
    document.getElementById('challengeModal').classList.add('active');
    startChallenge();
}

function startChallenge() {
    const randomIndex = Math.floor(Math.random() * challengeQuestions.length);
    const question = challengeQuestions[randomIndex];
    
    document.getElementById('challengeQuestion').textContent = question.question;
    document.getElementById('challengeOptions').innerHTML = question.options.map(opt => `
        <div class="challenge-option" onclick="selectChallengeOption(this, '${opt}')">${opt}</div>
    `).join('');
}

function selectChallengeOption(el, option) {
    document.querySelectorAll('.challenge-option').forEach(o => o.classList.remove('selected'));
    el.classList.add('selected');
    
    setTimeout(() => {
        alert(`你选择了：${option}\n等TA回答后看看是否一致吧！`);
    }, 500);
}

function showWakeUp() {
    alert('早起打卡功能开发中...\n敬请期待！\n\n规则：每天最早起床的一方可以要求对方请早餐 🍳');
}

// ============ 约会打卡 ============
function renderCheckins() {
    const list = document.getElementById('checkinList');
    if (DB.checkins.length === 0) {
        list.innerHTML = '<div class="empty-state">还没有打卡记录，点击上方按钮开始记录</div>';
        return;
    }
    
    const sortedCheckins = [...DB.checkins].sort((a, b) => new Date(b.date) - new Date(a.date));
    
    list.innerHTML = sortedCheckins.map(checkin => `
        <div class="checkin-card">
            <div class="checkin-icon">${getCheckinIcon(checkin.type)}</div>
            <div class="checkin-info">
                <div class="checkin-location">${checkin.location}</div>
                <div class="checkin-meta">
                    <span>${checkin.date}</span>
                    <span>${getCheckinTypeLabel(checkin.type)}</span>
                </div>
                ${checkin.note ? `<div class="checkin-note">${checkin.note}</div>` : ''}
            </div>
        </div>
    `).join('');
}

function showAddCheckin() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('checkinDate').value = today;
    document.getElementById('checkinModal').classList.add('active');
}

function saveCheckin() {
    const location = document.getElementById('checkinLocation').value;
    const date = document.getElementById('checkinDate').value;
    const type = document.getElementById('checkinType').value;
    const photo = document.getElementById('checkinPhoto').value;
    const note = document.getElementById('checkinNote').value;
    
    if (!location) {
        alert('请填写地点名称');
        return;
    }
    
    DB.checkins.push({ id: Date.now(), location, date, type, photo, note });
    saveToLocalStorage();
    renderCheckins();
    closeModal('checkinModal');
    
    // 清空表单
    document.getElementById('checkinLocation').value = '';
    document.getElementById('checkinPhoto').value = '';
    document.getElementById('checkinNote').value = '';
}

function getCheckinIcon(type) {
    const icons = {
        restaurant: '🍽️',
        park: '🌳',
        movie: '🎬',
        shopping: '🛍️',
        travel: '✈️',
        other: '📍'
    };
    return icons[type] || '📍';
}

function getCheckinTypeLabel(type) {
    const labels = { restaurant: '餐厅', park: '公园', movie: '电影院', shopping: '商场', travel: '旅行地', other: '其他' };
    return labels[type] || type;
}

// ============ 推荐收藏 ============
function renderFavorites() {
    const list = document.getElementById('favoritesList');
    if (DB.favorites.length === 0) {
        list.innerHTML = '<div class="empty-state">还没有收藏，点击上方按钮添加</div>';
        return;
    }
    
    list.innerHTML = DB.favorites.map(fav => `
        <div class="favorite-card">
            <div class="favorite-icon">${getFavoriteIcon(fav.category)}</div>
            <div class="favorite-info">
                <div class="favorite-name">${fav.name}</div>
                <div class="favorite-meta">
                    <span>${getCategoryLabel(fav.category)}</span>
                    <span class="favorite-rating">${'⭐'.repeat(fav.rating)}</span>
                </div>
                ${fav.reason ? `<div class="favorite-reason">"${fav.reason}"</div>` : ''}
            </div>
        </div>
    `).join('');
}

function showAddFavorite() {
    document.getElementById('favoriteModal').classList.add('active');
}

function saveFavorite() {
    const name = document.getElementById('favoriteName').value;
    const category = document.getElementById('favoriteCategory').value;
    const reason = document.getElementById('favoriteReason').value;
    const rating = parseInt(document.getElementById('favoriteRating').value);
    
    if (!name) {
        alert('请填写名称');
        return;
    }
    
    DB.favorites.push({ id: Date.now(), name, category, reason, rating });
    saveToLocalStorage();
    renderFavorites();
    closeModal('favoriteModal');
    
    // 清空表单
    document.getElementById('favoriteName').value = '';
    document.getElementById('favoriteReason').value = '';
}

function getFavoriteIcon(category) {
    const icons = {
        restaurant: '🍽️',
        shop: '🏪',
        movie: '🎬',
        book: '📚',
        music: '🎵',
        other: '❤️'
    };
    return icons[category] || '❤️';
}

// ============ 心愿悬赏 ============
function renderRewards() {
    const list = document.getElementById('rewardsList');
    if (DB.rewards.length === 0) {
        list.innerHTML = '<div class="empty-state">还没有悬赏，点击上方按钮发布</div>';
        return;
    }
    
    list.innerHTML = DB.rewards.map(reward => `
        <div class="reward-card ${reward.completed ? 'completed' : ''}">
            <div class="reward-header">
                <div class="reward-task">${reward.task}</div>
                <div class="reward-prize">${reward.prize}</div>
            </div>
            <div class="reward-meta">
                <span>难度: ${getDifficultyLabel(reward.difficulty)}</span>
                <span>截止: ${reward.deadline || '无'}</span>
                <span>${reward.completed ? '✅ 已完成' : '⏳ 进行中'}</span>
            </div>
        </div>
    `).join('');
}

function showAddReward() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('rewardDeadline').value = today;
    document.getElementById('rewardModal').classList.add('active');
}

function saveReward() {
    const task = document.getElementById('rewardTask').value;
    const difficulty = document.getElementById('rewardDifficulty').value;
    const prize = document.getElementById('rewardPrize').value;
    const deadline = document.getElementById('rewardDeadline').value;
    
    if (!task || !prize) {
        alert('请填写完整信息');
        return;
    }
    
    DB.rewards.push({ id: Date.now(), task, difficulty, prize, deadline, completed: false });
    saveToLocalStorage();
    renderRewards();
    closeModal('rewardModal');
    
    // 清空表单
    document.getElementById('rewardTask').value = '';
    document.getElementById('rewardPrize').value = '';
}

// ============ 工具函数 ============
function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

function initDateInputs() {
    // 初始化日期选择器默认为今天
    const today = new Date().toISOString().split('T')[0];
    document.querySelectorAll('input[type="date"]').forEach(input => {
        if (!input.value) {
            input.value = today;
        }
    });
}

// 点击弹窗外部关闭
document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('active');
        }
    });
});

// ESC关闭弹窗
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal.active').forEach(modal => {
            modal.classList.remove('active');
        });
    }
});

// 心情选择（日记）
document.querySelectorAll('#diaryMood .mood-option').forEach(option => {
    option.addEventListener('click', () => {
        document.querySelectorAll('#diaryMood .mood-option').forEach(o => o.classList.remove('selected'));
        option.classList.add('selected');
        appState.selectedMood = option.dataset.mood;
    });
});

console.log('💕 情侣网站已加载完成！');

// ============ 汉堡菜单（手机端） ============
function toggleMobileMenu() {
    const navMenu = document.getElementById('navMenu');
    const hamburger = document.getElementById('navHamburger');
    navMenu.classList.toggle('open');
    hamburger.classList.toggle('open');
}

// 点击遮罩关闭导航菜单
document.addEventListener('click', (e) => {
    const navMenu = document.getElementById('navMenu');
    const hamburger = document.getElementById('navHamburger');
    if (navMenu && navMenu.classList.contains('open')) {
        if (!navMenu.contains(e.target) && !hamburger.contains(e.target)) {
            navMenu.classList.remove('open');
            hamburger.classList.remove('open');
        }
    }
});

// ============ 吐槽空间 ============
let currentRantTarget = 'self';
let rantFilterState = 'all';

function showAddRant() {
    document.getElementById('rantModal').classList.add('active');
}

function selectRantTarget(target, btn) {
    currentRantTarget = target;
    document.querySelectorAll('.rant-target-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
}

function addEmoji(emoji) {
    const ta = document.getElementById('rantContent');
    const pos = ta.selectionStart;
    const val = ta.value;
    ta.value = val.slice(0, pos) + emoji + val.slice(pos);
    ta.focus();
    ta.selectionStart = ta.selectionEnd = pos + emoji.length;
}

function filterRants(filter, btn) {
    rantFilterState = filter;
    document.querySelectorAll('.rant-filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderRants();
}

function saveRant() {
    const content = document.getElementById('rantContent').value.trim();
    if (!content) {
        alert('写点什么嘛，别憋着～');
        return;
    }
    const type = document.getElementById('rantType').value;
    const moodLevel = parseInt(document.getElementById('rantMoodLevel').value);

    const rant = {
        id: Date.now(),
        content,
        type,
        target: currentRantTarget,
        moodLevel,
        author: 'me',
        date: new Date().toISOString(),
        hugs: 0,
        reply: null,
        resolved: false
    };

    DB.rants.unshift(rant);
    saveToLocalStorage();
    renderRants();
    closeModal('rantModal');

    // 清空
    document.getElementById('rantContent').value = '';
    document.getElementById('rantMoodLevel').value = '3';
}

function hugRant(id) {
    const rant = DB.rants.find(r => r.id === id);
    if (rant) {
        rant.hugs = (rant.hugs || 0) + 1;
        saveToLocalStorage();
        renderRants();
    }
}

function resolveRant(id) {
    const rant = DB.rants.find(r => r.id === id);
    if (rant) {
        rant.resolved = !rant.resolved;
        saveToLocalStorage();
        renderRants();
    }
}

let currentReplyRantId = null;

function showRantReply(id) {
    currentReplyRantId = id;
    const rant = DB.rants.find(r => r.id === id);
    if (!rant) return;
    document.getElementById('rantReplyOriginal').textContent = rant.content;
    document.getElementById('rantReplyContent').value = '';
    document.getElementById('rantReplyModal').classList.add('active');
}

function saveRantReply() {
    const content = document.getElementById('rantReplyContent').value.trim();
    if (!content) return;
    const rant = DB.rants.find(r => r.id === currentReplyRantId);
    if (rant) {
        rant.reply = { content, date: new Date().toISOString() };
        saveToLocalStorage();
        renderRants();
    }
    closeModal('rantReplyModal');
}

function renderRants() {
    const list = document.getElementById('rantList');
    if (!list) return;

    let rants = DB.rants;

    // 筛选
    if (rantFilterState === 'me') {
        rants = rants.filter(r => r.author === 'me');
    } else if (rantFilterState === 'partner') {
        rants = rants.filter(r => r.author === 'partner');
    } else if (rantFilterState === 'resolved') {
        rants = rants.filter(r => r.resolved);
    }

    if (rants.length === 0) {
        list.innerHTML = `
            <div class="rant-empty">
                <span class="rant-empty-icon">🐰</span>
                <p>这里空空的，${rantFilterState === 'all' ? '有什么想说的就说吧～' : '暂时没有内容'}</p>
            </div>
        `;
        return;
    }

    const typeLabels = {
        daily: '😤 日常',
        love: '💕 爱的抱怨',
        study: '📚 学习',
        funny: '😂 搞笑',
        serious: '🤔 认真说'
    };

    list.innerHTML = rants.map(rant => {
        const date = new Date(rant.date);
        const dateStr = `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
        const authorClass = rant.target === 'anonymous' ? 'rant-author-anon' : (rant.author === 'me' ? 'rant-author-me' : 'rant-author-partner');
        const authorText = rant.target === 'anonymous' ? '🙈 匿名' : (rant.author === 'me' ? '我说的' : 'TA说的');
        const cardClass = rant.author === 'partner' ? 'partner-rant' : (rant.target === 'anonymous' ? 'anonymous-rant' : '');
        const resolvedClass = rant.resolved ? 'resolved' : '';

        const moodDots = [1,2,3,4,5].map(i =>
            `<span class="mood-dot ${i <= rant.moodLevel ? 'active' : ''}"></span>`
        ).join('');

        const replyHtml = rant.reply ? `
            <div class="rant-reply-box">
                <strong>💌 回应：</strong> ${rant.reply.content}
            </div>
        ` : '';

        return `
            <div class="rant-card ${cardClass} ${resolvedClass}" data-id="${rant.id}">
                <div class="rant-card-header">
                    <div class="rant-meta">
                        <span class="rant-author-badge ${authorClass}">${authorText}</span>
                        <span class="rant-type-badge">${typeLabels[rant.type] || '吐槽'}</span>
                    </div>
                    <span class="rant-meta">${dateStr}</span>
                </div>
                <div class="rant-content">${rant.content}</div>
                <div class="rant-mood-bar">
                    <span>心情指数</span>
                    <div class="mood-dots">${moodDots}</div>
                </div>
                ${replyHtml}
                <div class="rant-actions">
                    <button class="rant-action-btn hug" onclick="hugRant(${rant.id})">🤗 抱抱 ${rant.hugs > 0 ? '(' + rant.hugs + ')' : ''}</button>
                    ${!rant.reply ? `<button class="rant-action-btn reply" onclick="showRantReply(${rant.id})">💌 回应</button>` : ''}
                    <button class="rant-action-btn resolve" onclick="resolveRant(${rant.id})">
                        ${rant.resolved ? '↩️ 重新打开' : '✅ 标记解决'}
                    </button>
                </div>
            </div>
        `;
    }).join('');
}
