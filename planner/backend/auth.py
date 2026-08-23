import os
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from dotenv import load_dotenv
from jose import JWTError, jwt
from passlib.context import CryptContext

load_dotenv()

# JWT signing key. Must be a long random secret kept out of source control —
# anyone who knows it can forge tokens for any user. Fail fast if it's missing.
SECRET_KEY = os.environ.get("SECRET_KEY")
if not SECRET_KEY:
    raise RuntimeError(
        "SECRET_KEY is not set. Add a long random value to your .env "
        "(see .env.example)."
    )
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Политика пароля. Нижняя граница — актуальный минимум; верхняя защищает от
# DoS мегабайтными паролями (bcrypt всё равно усекает до 72 байт).
PASSWORD_MIN_LENGTH = 8
PASSWORD_MAX_LENGTH = 128
# Минимум разных символов — отсекает «мусор» вроде 12341234 / aaaaaaaa,
# не требуя при этом спецсимволов и заглавных.
PASSWORD_MIN_UNIQUE = 5

# Ряды клавиатуры/цифр/алфавита (RU+EN). Пароль, целиком являющийся куском
# такого ряда (в прямом или обратном порядке), считаем предсказуемым.
_SEQUENCE_ROWS = (
    "1234567890",
    "abcdefghijklmnopqrstuvwxyz",
    "qwertyuiop", "asdfghjkl", "zxcvbnm",
    "йцукенгшщзхъ", "фывапролджэ", "ячсмитьбю",
)


def _looks_sequential(password: str) -> bool:
    low = password.lower()
    return any(low in row or low in row[::-1] for row in _SEQUENCE_ROWS)

# Небольшой локальный блоклист самых частых слабых паролей. Не заменяет проверку
# по утечкам, но отсекает очевидный мусор без внешних сетевых вызовов.
_COMMON_PASSWORDS = {
    "password", "passw0rd", "password1", "password123", "qwerty", "qwerty123",
    "qwertyuiop", "123456", "1234567", "12345678", "123456789", "1234567890",
    "111111", "000000", "654321", "123123", "666666", "888888", "121212",
    "112233", "iloveyou", "admin", "welcome", "monkey", "dragon", "letmein",
    "abc123", "football", "princess", "sunshine", "master", "shadow",
    "superman", "batman", "trustno1", "whatever", "zaq12wsx", "1q2w3e4r",
    "1qaz2wsx", "asdfghjkl", "qazwsx", "changeme", "secret", "starwars",
    "computer", "michael", "пароль", "йцукен", "любовь", "привет",
}


def validate_password_strength(password: str) -> str | None:
    """Проверяет политику пароля. Возвращает текст ошибки или None, если ок."""
    if len(password) < PASSWORD_MIN_LENGTH:
        return f"Пароль слишком короткий — минимум {PASSWORD_MIN_LENGTH} символов"
    if len(password) > PASSWORD_MAX_LENGTH:
        return f"Пароль слишком длинный — максимум {PASSWORD_MAX_LENGTH} символов"
    if password.lower() in _COMMON_PASSWORDS:
        return "Этот пароль слишком распространён — придумайте другой"
    if password.isdigit():
        return "Пароль не может состоять из одних цифр"
    if len(set(password)) < PASSWORD_MIN_UNIQUE:
        return "Слишком мало разных символов — такой пароль легко подобрать"
    if _looks_sequential(password):
        return "Пароль похож на простую последовательность — придумайте другой"
    return None


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return pwd_context.verify(password, password_hash)


def create_access_token(data: dict) -> tuple[str, str]:
    """Return (token, jti). Caller is responsible for persisting the jti
    as a session row so the token can be revoked."""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=ACCESS_TOKEN_EXPIRE_MINUTES
    )
    jti = uuid4().hex
    to_encode.update({"exp": expire, "jti": jti})
    encoded = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded, jti


def decode_access_token(token: str) -> dict | None:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        return None
