# Workout Tracker Frontend

A vanilla JavaScript frontend for the Workout Tracker application, designed to run on GitHub Pages.

## Setup Instructions

1. **Create a new PUBLIC GitHub repository** named `workout-tracker-frontend`

2. **Clone and add files:**
   ```bash
   git clone https://github.com/YOUR_USERNAME/workout-tracker-frontend.git
   cd workout-tracker-frontend
   # Copy all files from this directory into the repo
   git add .
   git commit -m "Initial commit"
   git push origin main
   ```

3. **Enable GitHub Pages:**
   - Go to your repository on GitHub
   - Click **Settings** → **Pages**
   - Under **Source**, select **Deploy from a branch**
   - Select branch: **main** (or **master**)
   - Select folder: **/ (root)**
   - Click **Save**
   - Your site will be available at: `https://YOUR_USERNAME.github.io/workout-tracker-frontend/`

4. **Update API Base URL:**
   - Open `app.js`
   - Find the line: `const API_BASE_URL = 'https://your-render-app.onrender.com';`
   - Replace with your Render backend URL (e.g., `https://workout-tracker-api.onrender.com`)
   - Commit and push the change

5. **Access your site:**
   - Visit `https://YOUR_USERNAME.github.io/workout-tracker-frontend/`
   - The frontend will connect to your backend API

## Features

- User authentication (login/register)
- Workout list with month selector
- Add/Edit/Delete workouts
- Workout detail view
- Statistics summary
- Responsive design
- JWT token stored in localStorage

## File Structure

```
workout-tracker-frontend/
├── index.html      # Main HTML file
├── styles.css      # All styles
├── app.js          # Application logic and routing
└── README.md       # This file
```
