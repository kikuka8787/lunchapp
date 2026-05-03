const API_KEY = 'b337fff3f7a344579f45e8a21409f58f';
const BASE_URL = 'https://open.neis.go.kr/hub';

// 알러지 정보 매핑
const ALLERGY_MAP = {
    1: '난류', 2: '우유', 3: '메밀', 4: '땅콩', 5: '대두', 
    6: '밀', 7: '고등어', 8: '게', 9: '새우', 10: '돼지고기', 
    11: '복숭아', 12: '토마토', 13: '아황산류', 14: '호두', 15: '닭고기', 
    16: '쇠고기', 17: '오징어', 18: '조개류', 19: '잣'
};

// 상태 관리
let state = {
    currentDate: new Date(),
    school: JSON.parse(localStorage.getItem('selectedSchool')) || null,
    allergies: JSON.parse(localStorage.getItem('userAllergies')) || []
};

// DOM 요소
const schoolSearchInput = document.getElementById('school-search');
const searchBtn = document.getElementById('search-btn');
const searchResults = document.getElementById('search-results');
const selectedSchoolInfo = document.getElementById('selected-school-info');
const currentSchoolName = document.getElementById('current-school-name');
const changeSchoolBtn = document.getElementById('change-school-btn');
const displayDate = document.getElementById('display-date');
const displayDay = document.getElementById('display-day');
const prevDayBtn = document.getElementById('prev-day');
const nextDayBtn = document.getElementById('next-day');
const mealContainer = document.getElementById('meal-container');
const toggleSettingsBtn = document.getElementById('toggle-settings');
const settingsSidebar = document.getElementById('settings-sidebar');
const closeSettingsBtn = document.getElementById('close-settings');
const overlay = document.getElementById('overlay');
const allergyOptions = document.getElementById('allergy-options');
const saveSettingsBtn = document.getElementById('save-settings');

// 초기화
function init() {
    renderAllergyOptions();
    updateDateDisplay();
    
    if (state.school) {
        showSelectedSchoolUI();
        fetchMeals();
    }

    // 이벤트 리스너
    searchBtn.addEventListener('click', searchSchool);
    schoolSearchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') searchSchool();
    });
    
    changeSchoolBtn.addEventListener('click', () => {
        state.school = null;
        localStorage.removeItem('selectedSchool');
        hideSelectedSchoolUI();
    });

    prevDayBtn.addEventListener('click', () => changeDate(-1));
    nextDayBtn.addEventListener('click', () => changeDate(1));

    toggleSettingsBtn.addEventListener('click', openSidebar);
    closeSettingsBtn.addEventListener('click', closeSidebar);
    overlay.addEventListener('click', closeSidebar);
    saveSettingsBtn.addEventListener('click', saveAllergies);
}

// 학교 검색
async function searchSchool() {
    const query = schoolSearchInput.value.trim();
    if (!query) return;

    try {
        const response = await fetch(`${BASE_URL}/schoolInfo?KEY=${API_KEY}&Type=json&SCHUL_NM=${encodeURIComponent(query)}`);
        const data = await response.json();

        if (data.schoolInfo) {
            renderSearchResults(data.schoolInfo[1].row);
        } else {
            alert('검색 결과가 없습니다.');
        }
    } catch (error) {
        console.error('학교 검색 실패:', error);
        alert('학교 검색 중 오류가 발생했습니다.');
    }
}

function renderSearchResults(schools) {
    searchResults.innerHTML = '';
    searchResults.classList.remove('hidden');

    schools.forEach(school => {
        const div = document.createElement('div');
        div.className = 'result-item';
        div.innerHTML = `
            <strong>${school.SCHUL_NM}</strong>
            <span class="school-loc">${school.ORG_RDNMA}</span>
        `;
        div.addEventListener('click', () => selectSchool(school));
        searchResults.appendChild(div);
    });
}

function selectSchool(school) {
    state.school = {
        name: school.SCHUL_NM,
        officeCode: school.ATPT_OFCDC_SC_CODE,
        schoolCode: school.SD_SCHUL_CODE
    };
    localStorage.setItem('selectedSchool', JSON.stringify(state.school));
    searchResults.classList.add('hidden');
    schoolSearchInput.value = '';
    showSelectedSchoolUI();
    fetchMeals();
}

function showSelectedSchoolUI() {
    selectedSchoolInfo.classList.remove('hidden');
    currentSchoolName.textContent = state.school.name;
    document.querySelector('.search-box').classList.add('hidden');
}

function hideSelectedSchoolUI() {
    selectedSchoolInfo.classList.add('hidden');
    document.querySelector('.search-box').classList.remove('hidden');
    mealContainer.innerHTML = '<div class="empty-state"><p>학교를 검색하여 급식 정보를 확인하세요.</p></div>';
}

// 날짜 변경
function changeDate(days) {
    state.currentDate.setDate(state.currentDate.getDate() + days);
    updateDateDisplay();
    if (state.school) fetchMeals();
}

function updateDateDisplay() {
    const options = { year: 'numeric', month: '2-digit', day: '2-digit' };
    const dateStr = state.currentDate.toLocaleDateString('ko-KR', options).replace(/\. /g, '. ').replace(/\.$/, '');
    displayDate.textContent = dateStr;
    
    const days = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
    displayDay.textContent = days[state.currentDate.getDay()];
}

// 급식 조회
async function fetchMeals() {
    if (!state.school) return;

    const year = state.currentDate.getFullYear();
    const month = String(state.currentDate.getMonth() + 1).padStart(2, '0');
    const day = String(state.currentDate.getDate()).padStart(2, '0');
    const ymd = `${year}${month}${day}`;
    mealContainer.innerHTML = '<div class="loader"></div>';

    try {
        const response = await fetch(`${BASE_URL}/mealServiceDietInfo?KEY=${API_KEY}&Type=json&ATPT_OFCDC_SC_CODE=${state.school.officeCode}&SD_SCHUL_CODE=${state.school.schoolCode}&MLSV_YMD=${ymd}`);
        const data = await response.json();

        if (data.mealServiceDietInfo) {
            renderMeals(data.mealServiceDietInfo[1].row);
        } else {
            mealContainer.innerHTML = '<div class="empty-state"><p>급식 정보가 없습니다. (주말 또는 휴교일)</p></div>';
        }
    } catch (error) {
        console.error('급식 조회 실패:', error);
        mealContainer.innerHTML = '<div class="empty-state"><p>정보를 가져오는 중 오류가 발생했습니다.</p></div>';
    }
}

function renderMeals(meals) {
    mealContainer.innerHTML = '';
    
    meals.forEach(meal => {
        const card = document.createElement('div');
        card.className = 'meal-card';
        
        // 메뉴 파싱 (번호 추출)
        const menuItems = meal.DDISH_NM.split('<br/>').map(item => {
            const match = item.match(/(.*)\((.*)\)/);
            if (match) {
                return {
                    name: match[1].trim(),
                    allergies: match[2].split('.').map(n => parseInt(n)).filter(n => !isNaN(n))
                };
            }
            return { name: item.trim(), allergies: [] };
        });

        const menuHtml = menuItems.map(item => {
            const hasAllergy = item.allergies.some(a => state.allergies.includes(a));
            const alertClass = hasAllergy ? 'allergy-alert' : '';
            const allergyNames = item.allergies.map(a => ALLERGY_MAP[a] || a).join(', ');
            
            return `
                <li class="menu-item ${alertClass}">
                    <span class="menu-name">${item.name}</span>
                    <span class="allergy-info">${allergyNames ? '[' + allergyNames + ']' : ''}</span>
                </li>
            `;
        }).join('');

        card.innerHTML = `
            <span class="meal-type">${meal.MMEAL_SC_NM} (${meal.CAL_INFO})</span>
            <ul class="menu-list">
                ${menuHtml}
            </ul>
        `;
        mealContainer.appendChild(card);
    });
}

// 알러지 설정
function renderAllergyOptions() {
    allergyOptions.innerHTML = '';
    Object.entries(ALLERGY_MAP).forEach(([id, name]) => {
        const label = document.createElement('label');
        label.className = 'allergy-item';
        const checked = state.allergies.includes(parseInt(id)) ? 'checked' : '';
        label.innerHTML = `
            <input type="checkbox" value="${id}" ${checked}>
            <span>${name}</span>
        `;
        allergyOptions.appendChild(label);
    });
}

function openSidebar() {
    settingsSidebar.classList.add('active');
    overlay.classList.remove('hidden');
}

function closeSidebar() {
    settingsSidebar.classList.remove('active');
    overlay.classList.add('hidden');
}

function saveAllergies() {
    const checkboxes = allergyOptions.querySelectorAll('input:checked');
    state.allergies = Array.from(checkboxes).map(cb => parseInt(cb.value));
    localStorage.setItem('userAllergies', JSON.stringify(state.allergies));
    closeSidebar();
    if (state.school) fetchMeals();
}

// 실행
init();
