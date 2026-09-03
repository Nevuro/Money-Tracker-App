@echo off
echo ========================================
echo    Money Tracker - Vanilla Version
echo ========================================
echo.

REM Check Python
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python not found. Please install Python 3.8+
    pause
    exit /b 1
)

REM Install dependencies
echo [1/2] Installing Python dependencies...
cd backend
pip install -r requirements.txt -q
if errorlevel 1 (
    echo [ERROR] Failed to install dependencies
    pause
    exit /b 1
)

echo.
echo [2/2] Starting backend server...
echo Open http://localhost:8000 in your browser
echo No login needed - app starts directly
echo.

python main.py