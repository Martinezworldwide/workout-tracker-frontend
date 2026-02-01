// API Configuration
const API_BASE_URL = 'https://workout-tracker-api-65eh.onrender.com';

// Router state
let currentView = 'login';
let currentData = {};
let isLoadingWorkouts = false; // Prevent infinite loop
let isLoadingStats = false; // Prevent infinite loop for stats

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    // Check for OAuth callback token in URL
    const urlParams = new URLSearchParams(window.location.search);
    const oauthToken = urlParams.get('token');
    const oauthUsername = urlParams.get('username');
    const oauthError = urlParams.get('error');
    
    if (oauthToken && oauthUsername) {
        // OAuth login successful
        localStorage.setItem('token', oauthToken);
        localStorage.setItem('user', JSON.stringify({ username: oauthUsername }));
        // Clean URL
        window.history.replaceState({}, document.title, window.location.pathname);
        currentView = 'workout-list';
        currentData.user = { username: oauthUsername };
        render();
    } else if (oauthError) {
        // OAuth login failed
        window.history.replaceState({}, document.title, window.location.pathname);
        checkAuth();
        render();
        const decodedError = decodeURIComponent(oauthError);
        if (oauthError === 'oauth_cancelled') {
            showError('Sign-in was cancelled');
        } else if (oauthError === 'oauth_not_configured') {
            showError('OAuth sign-in is not configured');
        } else {
            // Show the actual error message from backend for debugging
            showError(`Sign-in failed: ${decodedError}. Please try again or use regular login.`);
            console.error('OAuth error details:', decodedError);
        }
    } else {
        checkAuth();
        render();
    }
    
    // Keep Render service warm by pinging health endpoint every 10 minutes
    // This prevents cold starts on the free tier
    setInterval(async () => {
        try {
            await fetch(`${API_BASE_URL}/health`).catch(() => {});
        } catch (e) {
            // Silently fail - just trying to keep service warm
        }
    }, 10 * 60 * 1000); // Every 10 minutes
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
            // Only load workouts if not already loading (prevents infinite loop)
            if (!isLoadingWorkouts) {
                loadWorkouts();
            }
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
            // Only load stats if not already loading (prevents infinite loop)
            if (!isLoadingStats) {
                loadStats();
            }
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
        
        // Check content type before parsing JSON
        const contentType = response.headers.get('content-type');
        let data;
        
        if (contentType && contentType.includes('application/json')) {
            data = await response.json();
        } else {
            // Handle non-JSON responses (like rate limit plain text)
            const text = await response.text();
            if (response.status === 429) {
                throw new Error('Too many requests. Please wait a moment and try again.');
            }
            throw new Error(text || 'Request failed');
        }
        
        if (!response.ok) {
            // Handle rate limiting specifically
            if (response.status === 429) {
                throw new Error(data.message || 'Too many requests. Please wait a moment and try again.');
            }
            throw new Error(data.message || 'Request failed');
        }
        
        return data;
    } catch (error) {
        // Re-throw if it's already an Error with message
        if (error instanceof Error) {
            throw error;
        }
        // Otherwise wrap in Error
        throw new Error(error.message || 'Request failed');
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
    // Prevent multiple simultaneous loads
    if (isLoadingWorkouts) {
        return;
    }
    
    isLoadingWorkouts = true;
    const month = currentData.selectedMonth || getCurrentMonth();
    
    // Show loading state
    currentData.workouts = null;
    // Update DOM directly instead of calling render() to avoid loop
    const app = document.getElementById('app');
    if (app && currentView === 'workout-list') {
        app.innerHTML = renderWorkoutList();
    }
    
    try {
        const workouts = await apiCall(`/api/workouts?month=${month}`);
        currentData.workouts = workouts;
        // Update DOM directly
        if (app && currentView === 'workout-list') {
            app.innerHTML = renderWorkoutList();
        }
    } catch (error) {
        showError(error.message);
        currentData.workouts = [];
        // Update DOM directly
        if (app && currentView === 'workout-list') {
            app.innerHTML = renderWorkoutList();
        }
    } finally {
        isLoadingWorkouts = false;
    }
}

async function handleWorkoutSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const workoutId = form.dataset.workoutId;
    
    // Disable submit button and show loading
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn?.textContent;
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Saving...';
    }
    
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
    } finally {
        // Re-enable button
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
        }
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
    // Find all exercise containers
    const exerciseContainers = form.querySelectorAll('[data-exercise-index]');
    
    exerciseContainers.forEach((exerciseContainer, index) => {
        // Get exercise name from the input within this container
        const nameInput = exerciseContainer.querySelector('[data-exercise-name]');
        if (!nameInput) return;
        
        const exerciseName = nameInput.value.trim();
        if (!exerciseName) return;
        
        // Find all sets within this exercise container
        const sets = [];
        const setInputs = exerciseContainer.querySelectorAll('[data-set]');
        
        setInputs.forEach(setInput => {
            const repsInput = setInput.querySelector('[data-reps]');
            const weightInput = setInput.querySelector('[data-weight]');
            
            if (!repsInput || !weightInput) return;
            
            const repsValue = repsInput.value.trim();
            const weightValue = weightInput.value.trim();
            
            // Only parse if values are provided
            if (repsValue || weightValue) {
                const reps = repsValue ? parseInt(repsValue) : 0;
                const weight = weightValue ? parseFloat(weightValue) : 0;
                
                // Only add set if it has at least one value
                if (reps > 0 || weight > 0) {
                    sets.push({ reps: Math.max(0, reps), weight: Math.max(0, weight) });
                }
            }
        });
        
        // Only add exercise if it has at least one valid set
        if (sets.length > 0) {
            exercises.push({ name: exerciseName, sets });
        }
    });
    
    return exercises;
}

// Stats functions
async function loadStats() {
    // Prevent multiple simultaneous loads
    if (isLoadingStats) {
        return;
    }
    
    isLoadingStats = true;
    const from = currentData.statsFrom || getFirstDayOfMonth();
    const to = currentData.statsTo || getLastDayOfMonth();
    
    try {
        const stats = await apiCall(`/api/stats/summary?from=${from}&to=${to}`);
        currentData.stats = stats;
        // Update DOM directly instead of calling render() to avoid loop
        const app = document.getElementById('app');
        if (app && currentView === 'stats') {
            app.innerHTML = renderStats();
        }
    } catch (error) {
        showError(error.message);
    } finally {
        isLoadingStats = false;
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
            <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #e0e0e0;">
                <p style="text-align: center; color: #666; margin-bottom: 15px;">Or sign in with:</p>
                <div style="display: flex; gap: 10px; justify-content: center;">
                    <button type="button" class="btn" style="background: #4285f4; color: white;" onclick="handleGoogleSignIn()">
                        <span style="margin-right: 8px;">🔵</span> Google
                    </button>
                    <button type="button" class="btn" style="background: #000; color: white;" onclick="handleAppleSignIn()">
                        <span style="margin-right: 8px;">⚫</span> Apple
                    </button>
                </div>
                <p style="text-align: center; font-size: 12px; color: #999; margin-top: 10px;">
                    OAuth sign-in is optional and only used for convenience
                </p>
            </div>
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
                ${workouts === null ? '<div class="loading"><div class="spinner"></div><p>Loading workouts...</p></div>' : ''}
                ${workouts !== null && workouts.length === 0 ? '<p>No workouts found for this month.</p>' : ''}
                ${workouts !== null && workouts.length > 0 ? workouts.map(workout => `
                    <div class="workout-item" onclick="navigate('workout-detail', { workout: ${JSON.stringify(workout).replace(/"/g, '&quot;')} })">
                        <div class="workout-item-header">
                            <div class="workout-item-name">${escapeHtml(workout.name)}</div>
                            <div class="workout-item-date">${formatDate(workout.date)}</div>
                        </div>
                        <div class="workout-item-exercises">${workout.exercises.length} exercise(s)</div>
                    </div>
                `).join('') : ''}
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
    
    // Calculate workout total volume
    let workoutTotalVolume = 0;
    
    const exercisesHtml = workout.exercises.map(exercise => {
        // Calculate exercise total volume
        let exerciseTotalVolume = 0;
        
        const setsHtml = exercise.sets.map(set => {
            const reps = Number(set.reps) || 0;
            const weight = Number(set.weight) || 0;
            const setVolume = reps * weight;
            exerciseTotalVolume += setVolume;
            
            return `
                <div class="set-item">
                    <span>${reps} reps × ${weight} lbs = <strong>${setVolume.toLocaleString()} lbs</strong></span>
                </div>
            `;
        }).join('');
        
        workoutTotalVolume += exerciseTotalVolume;
        
        return `
            <div class="exercise-item">
                <div class="exercise-name">
                    ${escapeHtml(exercise.name)}
                    <span class="exercise-volume">Total: ${exerciseTotalVolume.toLocaleString()} lbs</span>
                </div>
                <div class="sets-list">
                    ${setsHtml}
                </div>
            </div>
        `;
    }).join('');
    
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
            <div class="workout-summary" style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                <p style="margin: 0; font-size: 18px; font-weight: 600; color: #667eea;">
                    <strong>Total Workout Volume: ${workoutTotalVolume.toLocaleString()} lbs</strong>
                </p>
            </div>
            <div class="exercise-list">
                ${exercisesHtml}
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
                    <div class="stat-value">${Number(stats.totalVolume || 0).toLocaleString()}</div>
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

// OAuth handlers
function handleGoogleSignIn() {
    window.location.href = `${API_BASE_URL}/api/oauth/google`;
}

function handleAppleSignIn() {
    window.location.href = `${API_BASE_URL}/api/oauth/apple`;
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
window.handleGoogleSignIn = handleGoogleSignIn;
window.handleAppleSignIn = handleAppleSignIn;
