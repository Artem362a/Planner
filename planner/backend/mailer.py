from __future__ import annotations

import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from dotenv import load_dotenv

load_dotenv()

SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "465"))
SMTP_USER = os.getenv("SMTP_USER")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")
SMTP_FROM = os.getenv("SMTP_FROM", SMTP_USER)


def send_verification_email(
    to_email: str,
    username: str,
    verification_token: str,
    frontend_url: str,
) -> None:
    if not SMTP_USER or not SMTP_PASSWORD or not SMTP_FROM:
        raise RuntimeError("SMTP settings are not configured")

    verification_link = f"{frontend_url}/verify-email?token={verification_token}"

    subject = "Подтверждение email"
    html_body = f"""
    <html>
      <body>
        <p>Привет, {username}!</p>
        <p>Подтверди email по ссылке:</p>
        <p><a href="{verification_link}">{verification_link}</a></p>
      </body>
    </html>
    """

    text_body = (
        f"Привет, {username}!\n\n"
        f"Подтверди email по ссылке:\n{verification_link}\n"
    )

    message = MIMEMultipart("alternative")
    message["Subject"] = subject
    message["From"] = SMTP_FROM
    message["To"] = to_email
    message.attach(MIMEText(text_body, "plain", "utf-8"))
    message.attach(MIMEText(html_body, "html", "utf-8"))

    print("SMTP_SSL: connecting...")
    with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, timeout=10) as server:
        print("SMTP_SSL: login...")
        server.login(SMTP_USER, SMTP_PASSWORD)
        print("SMTP_SSL: sending...")
        server.sendmail(SMTP_FROM, to_email, message.as_string())
    print("SMTP_SSL: done")