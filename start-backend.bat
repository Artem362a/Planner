@echo off
cd /d "%~dp0planner\backend"
"C:\Users\Liza\AppData\Local\Python\pythoncore-3.14-64\Scripts\uvicorn.exe" main:app --reload
pause
