# Money Tracker - Vanilla Version

Simple HTML/CSS/JS frontend with Python FastAPI backend and SQLite database. No login required.

## How to Run

```bash
cd vanilla/backend
pip install -r requirements.txt
python main.py
```

Then open **http://localhost:8000** in your browser. The app loads directly — no login needed.

API docs: **http://localhost:8000/docs**

## Features

- Add/Edit/Delete transactions (income & expense)
- Filter by month, account, category, type
- Charts (expense breakdown + monthly income vs expense)
- Category management (add custom categories)
- Budget management with progress bars and alerts
- Export to JSON/CSV
- All data stored in SQLite database

## Tech Stack

- **Frontend**: Vanilla HTML + CSS + JavaScript + Chart.js
- **Backend**: Python FastAPI + SQLAlchemy + SQLite

## Default Categories

### Income (دخل)
- مرتب (Salary), عمل حر (Freelance), استثمار (Investment)

### Expense (مصروف)
- أكل (Food), مواصلات (Transport), تسوق (Shopping), فواتير (Bills), صحة (Health), تعليم (Education), ترفيه (Entertainment), أخرى (Other)

## Notes

- No registration or login required — the app uses a single user
- Delete the `money_tracker.db` file in `backend/` to reset all data