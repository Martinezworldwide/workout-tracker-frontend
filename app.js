// API Configuration
const API_BASE_URL = 'https://workout-tracker-api-65eh.onrender.com';

// Router state
let currentView = 'login';
let currentData = {};

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    render();
});

// Check if user is authenticated
function checkAuth() {
    const token = localStorage.getItem('token');
    const user = localStorage.getItem('user');
    
    if (token && user) {
        try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            // Check if token is expired
            if (payload.exp * 1000 < Date.now()) {
                logout();
                return;
            }
            currentView = 'workout-list';
            currentData.user = JSON.parse(user);
        } catch (e) {
            logout();
        }
    } else {
        currentView = 'login';
    }
}

// Router
function navigate(view, data = {}) {
    currentView = view;
    currentData = { ...currentData, ...data };
    render();
}

// Render current view
function render() {
    const app = document.getElementById('app');
    
    switch (currentView) {
        case 'login':
            app.innerHTML = renderLogin();
            break;
        case 'register':
            app.innerHTML = renderRegister();
            break;
        case 'workout-list':
            app.innerHTML = renderWorkoutList();
            loadWorkouts();
            break;
        case 'workout-add':
            app.innerHTML = renderWorkoutForm();
            break;
        case 'workout-edit':
            app.innerHTML = renderWorkoutForm(currentData.workout);
            break;
        case 'workout-detail':
            app.innerHTML = renderWorkoutDetail(currentData.workout);
            break;
        case 'stats':
            app.innerHTML = renderStats();
            loadStats();
            break;
        default:
            app.innerHTML = renderLogin();
    }
}

// API helper with error handling
async function apiCall(endpoint, options = {}) {
    const token = localStorage.getItem('token');
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };
    
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
            ...options,
            headers
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.message || 'Request failed');
        }
        
        return data;
    } catch (error) {
        throw error;
    }
}

// Auth functions
async function handleLogin(e) {
    e.preventDefault();
    const form = e.target;
    const username = form.username.value;
    const password = form.password.value;
    
    try {
        const data = await apiCall('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });
        
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        navigate('workout-list');
    } catch (error) {
        showError(error.message);
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const form = e.target;
    const username = form.username.value;
    const password = form.password.value;
    const recoveryQuestion = form.recoveryQuestion.value;
    const recoveryAnswer = form.recoveryAnswer.value;
    
    try {
        await apiCall('/api/auth/register', {
            method: 'POST',
            body: JSON.stringify({
                username,
                password,
                recovery: {
                    question: recoveryQuestion,
                    answer: recoveryAnswer
                }
            })
        });
        
        showSuccess('Registration successful! Please login.');
        navigate('login');
    } catch (error) {
        showError(error.message);
    }
}

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    currentData = {};
    navigate('login');
}

// Workout functions
async function loadWorkouts() {
    const month = currentData.selectedMonth || getCurrentMonth();
    try {
        const workouts = await apiCall(`/api/workouts?month=${month}`);
        currentData.workouts = workouts;
        render();
    } catch (error) {
        showError(error.message);
    }
}

async function handleWorkoutSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const workoutId = form.dataset.workoutId;
    
    const workout = {
        date: form.date.value,
        name: form.name.value,
        notes: form.notes.value,
        exercises: parseExercises(form)
    };
    
    try {
        if (workoutId) {
            await apiCall(`/api/workouts/${workoutId}`, {
                method: 'PUT',
                body: JSON.stringify(workout)
            });
        } else {
            await apiCall('/api/workouts', {
                method: 'POST',
                body: JSON.stringify(workout)
            });
        }
        
        navigate('workout-list');
    } catch (error) {
        showError(error.message);
    }
}

async function handleWorkoutDelete(workoutId) {
    if (!confirm('Are you sure you want to delete this workout?')) {
        return;
    }
    
    try {
        await apiCall(`/api/workouts/${workoutId}`, {
            method: 'DELETE'
        });
        navigate('workout-list');
    } catch (error) {
        showError(error.message);
    }
}

// Parse exercises from form
function parseExercises(form) {
    const exercises = [];
    const exerciseNames = form.querySelectorAll('[data-exercise-name]');
    
    exerciseNames.forEach((nameInput, index) => {
        const exerciseName = nameInput.value.trim();
        if (!exerciseName) return;
        
        const sets = [];
        const setInputs = form.querySelectorAll(`[data-exercise-index="${index}"][data-set]`);
        
        setInputs.forEach(setInput => {
            const reps = parseInt(setInput.querySelector('[data-reps]').value) || 0;
            const weight = parseFloat(setInput.querySelector('[data-weight]').value) || 0;
            if (reps > 0 || weight > 0) {
                sets.push({ reps, weight });
            }
        });
        
        if (sets.length > 0) {
            exercises.push({ name: exerciseName, sets });
        }
    });
    
    return exercises;
}

// Stats functions
async function loadStats() {
    const from = currentData.statsFrom || getFirstDayOfMonth();
    const to = currentData.statsTo || getLastDayOfMonth();
    
    try {
        const stats = await apiCall(`/api/stats/summary?from=${from}&to=${to}`);
        currentData.stats = stats;
        render();
    } catch (error) {
        showError(error.message);
    }
}

// View renderers
function renderLogin() {
    return `
        <div class="card">
            <h2>Login</h2>
            <form onsubmit="handleLogin(event)">
                <div class="form-group">
                    <label>Username</label>
                    <input type="text" name="username" required>
                </div>
                <div class="form-group">
                    <label>Password</label>
                    <input type="password" name="password" required>
                </div>
                <div class="form-actions">
                    <button type="submit" class="btn btn-primary">Login</button>
                    <button type="button" class="btn btn-secondary" onclick="navigate('register')">Register</button>
                </div>
            </form>
        </div>
    `;
}

function renderRegister() {
    return `
        <div class="card">
            <h2>Register</h2>
            <form onsubmit="handleRegister(event)">
                <div class="form-group">
                    <label>Username</label>
                    <input type="text" name="username" required>
                </div>
                <div class="form-group">
                    <label>Password</label>
                    <input type="password" name="password" required>
                </div>
                <div class="form-group">
                    <label>Recovery Question</label>
                    <input type="text" name="recoveryQuestion" placeholder="e.g., What city were you born in?" required>
                </div>
                <div class="form-group">
                    <label>Recovery Answer</label>
                    <input type="text" name="recoveryAnswer" required>
                </div>
                <div class="form-actions">
                    <button type="submit" class="btn btn-primary">Register</button>
                    <button type="button" class="btn btn-secondary" onclick="navigate('login')">Back to Login</button>
                </div>
            </form>
        </div>
    `;
}

function renderWorkoutList() {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const month = currentData.selectedMonth || getCurrentMonth();
    const workouts = currentData.workouts || [];
    
    return `
        <div class="header">
            <h1>Workout Tracker</h1>
            <div class="user-info">
                <span class="username">${user.username || ''}</span>
                <button class="btn btn-secondary" onclick="navigate('stats')">Stats</button>
                <button class="btn btn-secondary" onclick="logout()">Logout</button>
            </div>
        </div>
        <div class="card">
            <div class="month-selector">
                <label>Month:</label>
                <input type="month" value="${month}" onchange="currentData.selectedMonth = this.value; loadWorkouts()">
                <button class="btn btn-primary" onclick="navigate('workout-add')">Add Workout</button>
            </div>
            <div class="workout-list">
                ${workouts.length === 0 ? '<p>No workouts found for this month.</p>' : ''}
                ${workouts.map(workout => `
                    <div class="workout-item" onclick="navigate('workout-detail', { workout: ${JSON.stringify(workout).replace(/"/g, '&quot;')} })">
                        <div class="workout-item-header">
                            <div class="workout-item-name">${escapeHtml(workout.name)}</div>
                            <div class="workout-item-date">${formatDate(workout.date)}</div>
                        </div>
                        <div class="workout-item-exercises">${workout.exercises.length} exercise(s)</div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

function renderWorkoutForm(workout = null) {
    const isEdit = !!workout;
    const date = workout?.date || new Date().toISOString().split('T')[0];
    const name = workout?.name || '';
    const notes = workout?.notes || '';
    const exercises = workout?.exercises || [{ name: '', sets: [{ reps: '', weight: '' }] }];
    
    return `
        <div class="header">
            <h1>${isEdit ? 'Edit' : 'Add'} Workout</h1>
            <button class="btn btn-secondary" onclick="navigate('workout-list')">Back</button>
        </div>
        <div class="card">
            <form onsubmit="handleWorkoutSubmit(event)" data-workout-id="${workout?.id || ''}">
                <div class="form-group">
                    <label>Date</label>
                    <input type="date" name="date" value="${date}" required>
                </div>
                <div class="form-group">
                    <label>Workout Name</label>
                    <input type="text" name="name" value="${escapeHtml(name)}" required>
                </div>
                <div class="form-group">
                    <label>Notes</label>
                    <textarea name="notes">${escapeHtml(notes)}</textarea>
                </div>
                <div id="exercises-container">
                    ${exercises.map((exercise, exIndex) => `
                        <div class="exercise-item" data-exercise-index="${exIndex}">
                            <div class="form-group">
                                <label>Exercise Name</label>
                                <input type="text" data-exercise-name value="${escapeHtml(exercise.name)}" required>
                            </div>
                            <div class="sets-list">
                                <label>Sets</label>
                                ${exercise.sets.map((set, setIndex) => `
                                    <div class="set-item" data-set>
                                        <input type="number" data-reps placeholder="Reps" value="${set.reps || ''}" min="0">
                                        <input type="number" data-weight placeholder="Weight (lbs)" value="${set.weight || ''}" min="0" step="0.5">
                                    </div>
                                `).join('')}
                                <button type="button" class="btn btn-secondary" onclick="addSet(${exIndex})">Add Set</button>
                            </div>
                        </div>
                    `).join('')}
                </div>
                <button type="button" class="btn btn-secondary" onclick="addExercise()">Add Exercise</button>
                <div class="form-actions">
                    <button type="submit" class="btn btn-primary">${isEdit ? 'Update' : 'Create'} Workout</button>
                    <button type="button" class="btn btn-secondary" onclick="navigate('workout-list')">Cancel</button>
                </div>
            </form>
        </div>
    `;
}

function renderWorkoutDetail(workout) {
    if (!workout) {
        navigate('workout-list');
        return '';
    }
    
    return `
        <div class="header">
            <h1>Workout Details</h1>
            <div>
                <button class="btn btn-primary" onclick="navigate('workout-edit', { workout: ${JSON.stringify(workout).replace(/"/g, '&quot;')} })">Edit</button>
                <button class="btn btn-danger" onclick="handleWorkoutDelete('${workout.id}')">Delete</button>
                <button class="btn btn-secondary" onclick="navigate('workout-list')">Back</button>
            </div>
        </div>
        <div class="card">
            <h2>${escapeHtml(workout.name)}</h2>
            <p><strong>Date:</strong> ${formatDate(workout.date)}</p>
            ${workout.notes ? `<p><strong>Notes:</strong> ${escapeHtml(workout.notes)}</p>` : ''}
            <div class="exercise-list">
                ${workout.exercises.map(exercise => `
                    <div class="exercise-item">
                        <div class="exercise-name">${escapeHtml(exercise.name)}</div>
                        <div class="sets-list">
                            ${exercise.sets.map(set => `
                                <div class="set-item">
                                    <span>${set.reps} reps</span>
                                    <span>${set.weight} lbs</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

function renderStats() {
    const stats = currentData.stats || {};
    const from = currentData.statsFrom || getFirstDayOfMonth();
    const to = currentData.statsTo || getLastDayOfMonth();
    
    return `
        <div class="header">
            <h1>Statistics</h1>
            <button class="btn btn-secondary" onclick="navigate('workout-list')">Back</button>
        </div>
        <div class="card">
            <div class="date-range">
                <label>From:</label>
                <input type="date" value="${from}" onchange="currentData.statsFrom = this.value; loadStats()">
                <label>To:</label>
                <input type="date" value="${to}" onchange="currentData.statsTo = this.value; loadStats()">
            </div>
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-value">${stats.totalWorkouts || 0}</div>
                    <div class="stat-label">Total Workouts</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${stats.totalExercises || 0}</div>
                    <div class="stat-label">Total Exercises</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${stats.totalSets || 0}</div>
                    <div class="stat-label">Total Sets</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${stats.totalVolume || 0}</div>
                    <div class="stat-label">Total Volume (lbs)</div>
                </div>
            </div>
        </div>
    `;
}

// Helper functions
function showError(message) {
    const app = document.getElementById('app');
    const errorDiv = document.createElement('div');
    errorDiv.className = 'message message-error';
    errorDiv.textContent = message;
    app.insertBefore(errorDiv, app.firstChild);
    setTimeout(() => errorDiv.remove(), 5000);
}

function showSuccess(message) {
    const app = document.getElementById('app');
    const successDiv = document.createElement('div');
    successDiv.className = 'message message-success';
    successDiv.textContent = message;
    app.insertBefore(successDiv, app.firstChild);
    setTimeout(() => successDiv.remove(), 5000);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function getCurrentMonth() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getFirstDayOfMonth() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

function getLastDayOfMonth() {
    const now = new Date();
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return `${lastDay.getFullYear()}-${String(lastDay.getMonth() + 1).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`;
}

// Exercise and set management
function addExercise() {
    const container = document.getElementById('exercises-container');
    const exerciseDiv = document.createElement('div');
    exerciseDiv.className = 'exercise-item';
    exerciseDiv.setAttribute('data-exercise-index', container.children.length);
    exerciseDiv.innerHTML = `
        <div class="form-group">
            <label>Exercise Name</label>
            <input type="text" data-exercise-name required>
        </div>
        <div class="sets-list">
            <label>Sets</label>
            <div class="set-item" data-set>
                <input type="number" data-reps placeholder="Reps" min="0">
                <input type="number" data-weight placeholder="Weight (lbs)" min="0" step="0.5">
            </div>
            <button type="button" class="btn btn-secondary" onclick="addSet(${container.children.length})">Add Set</button>
        </div>
    `;
    container.appendChild(exerciseDiv);
}

function addSet(exerciseIndex) {
    const exerciseItem = document.querySelector(`[data-exercise-index="${exerciseIndex}"]`);
    const setsList = exerciseItem.querySelector('.sets-list');
    const setDiv = document.createElement('div');
    setDiv.className = 'set-item';
    setDiv.setAttribute('data-set', '');
    setDiv.innerHTML = `
        <input type="number" data-reps placeholder="Reps" min="0">
        <input type="number" data-weight placeholder="Weight (lbs)" min="0" step="0.5">
    `;
    setsList.insertBefore(setDiv, setsList.lastElementChild);
}

// Expose functions to global scope for inline handlers
window.navigate = navigate;
window.handleLogin = handleLogin;
window.handleRegister = handleRegister;
window.logout = logout;
window.loadWorkouts = loadWorkouts;
window.handleWorkoutSubmit = handleWorkoutSubmit;
window.handleWorkoutDelete = handleWorkoutDelete;
window.loadStats = loadStats;
window.addExercise = addExercise;
window.addSet = addSet;
