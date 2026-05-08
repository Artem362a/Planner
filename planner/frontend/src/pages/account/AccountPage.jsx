import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { updatePassword, updateProfile, uploadAvatar } from "../../api/auth";

const MAX_AVATAR_SIZE = 2 * 1024 * 1024;

const PRESET_AVATARS = [
  { id: "sunrise", label: "Рассвет", value: "preset:sunrise:#ff8a65:#ffd166" },
  { id: "mint", label: "Мята", value: "preset:mint:#2dd4bf:#b8f7d4" },
  { id: "violet", label: "Фиолетовый", value: "preset:violet:#7c3aed:#c4b5fd" },
  { id: "sky", label: "Небо", value: "preset:sky:#38bdf8:#dbeafe" },
  { id: "berry", label: "Ягода", value: "preset:berry:#db2777:#fecdd3" },
  { id: "forest", label: "Лес", value: "preset:forest:#16a34a:#bbf7d0" },
];

function avatarStyle(avatar) {
  if (!avatar?.startsWith("preset:")) return {};

  const [, , colorA, colorB] = avatar.split(":");
  return {
    background: `linear-gradient(135deg, ${colorA}, ${colorB})`,
  };
}

function AvatarPreview({ avatar, username, size = "large" }) {
  const initial = (username || "U").slice(0, 1).toUpperCase();

  if (avatar && !avatar.startsWith("preset:")) {
    return (
      <div className={`account-avatar-preview account-avatar-preview--${size}`}>
        <img src={avatar} alt="" />
      </div>
    );
  }

  return (
    <div
      className={`account-avatar-preview account-avatar-preview--${size}`}
      style={avatarStyle(avatar)}
    >
      <span>{initial}</span>
    </div>
  );
}

function AccountPage({ user, onUserUpdate }) {
  const [username, setUsername] = useState(user?.username || "");
  const [avatar, setAvatar] = useState(user?.avatar || PRESET_AVATARS[0].value);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");
  const [profileStatus, setProfileStatus] = useState("");
  const [passwordStatus, setPasswordStatus] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);

  const selectedPreset = useMemo(
    () => PRESET_AVATARS.find((item) => item.value === avatar),
    [avatar]
  );

  useEffect(() => {
    setUsername(user?.username || "");
    setAvatar(user?.avatar || PRESET_AVATARS[0].value);
  }, [user]);

  async function handleProfileSubmit(event) {
    event.preventDefault();
    setProfileStatus("");
    setProfileSaving(true);

    try {
      const updated = await updateProfile({ username, avatar });
      onUserUpdate?.(updated);
      setProfileStatus("Профиль обновлён");
    } catch (error) {
      setProfileStatus(error.message || "Не удалось обновить профиль");
    } finally {
      setProfileSaving(false);
    }
  }

  async function handlePasswordSubmit(event) {
    event.preventDefault();
    setPasswordStatus("");

    if (newPassword !== repeatPassword) {
      setPasswordStatus("Новые пароли не совпадают");
      return;
    }

    setPasswordSaving(true);

    try {
      await updatePassword({
        current_password: currentPassword,
        new_password: newPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
      setRepeatPassword("");
      setPasswordStatus("Пароль обновлён");
    } catch (error) {
      setPasswordStatus(error.message || "Не удалось обновить пароль");
    } finally {
      setPasswordSaving(false);
    }
  }

  async function handleUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setProfileStatus("Выберите изображение");
      return;
    }

    if (file.size > MAX_AVATAR_SIZE) {
      setProfileStatus("Картинка слишком большая. Максимум 2 МБ");
      return;
    }

    setProfileStatus("");
    setProfileSaving(true);

    try {
      const updated = await uploadAvatar(file);
      setAvatar(updated.avatar || PRESET_AVATARS[0].value);
      onUserUpdate?.(updated);
      setProfileStatus("Аватарка загружена");
    } catch (error) {
      setProfileStatus(error.message || "Не удалось загрузить аватарку");
    } finally {
      setProfileSaving(false);
      event.target.value = "";
    }
  }

  return (
    <div className="app-wrapper">
      <div className="app">
        <header className="app-header">
          <div className="app-header-left">
            <Link to="/" className="back-link">
              ←
            </Link>
          </div>

          <div className="app-header-center">АККАУНТ</div>

          <div className="app-header-right" />
        </header>

        <main className="account-page-main">
          <section className="account-shell">
            <div className="account-profile-band">
              <AvatarPreview avatar={avatar} username={username} />

              <div className="account-profile-copy">
                <span>Профиль</span>
                <h1>{username || "Пользователь"}</h1>
                <p>{user?.email}</p>
              </div>
            </div>

            <div className="account-settings">
              <form className="account-section" onSubmit={handleProfileSubmit}>
                <div className="account-section-info">
                  <h2>Ник и аватарка</h2>
                  <p>{selectedPreset?.label || "Своё изображение"}</p>
                </div>

                <div className="account-section-controls">
                  <label className="account-field">
                    <span>Ник</span>
                    <input
                      value={username}
                      onChange={(event) => setUsername(event.target.value)}
                      minLength={2}
                      required
                    />
                  </label>

                  <div className="account-avatar-picker" aria-label="Выбор аватарки">
                    {PRESET_AVATARS.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={
                          "account-avatar-option" +
                          (avatar === item.value ? " account-avatar-option--active" : "")
                        }
                        onClick={() => setAvatar(item.value)}
                        title={item.label}
                      >
                        <AvatarPreview avatar={item.value} username={username} size="small" />
                      </button>
                    ))}
                  </div>

                  <label className="account-upload">
                    <input type="file" accept="image/*" onChange={handleUpload} />
                    <span>Загрузить своё изображение до 2 МБ</span>
                  </label>

                  <button type="submit" className="account-primary-btn" disabled={profileSaving}>
                    {profileSaving ? "Сохраняем..." : "Сохранить профиль"}
                  </button>

                  {profileStatus && <div className="account-status">{profileStatus}</div>}
                </div>
              </form>

              <form className="account-section" onSubmit={handlePasswordSubmit}>
                <div className="account-section-info">
                  <h2>Смена пароля</h2>
                  <p>Новый пароль должен быть не короче 6 символов</p>
                </div>

                <div className="account-section-controls">
                  <label className="account-field">
                    <span>Текущий пароль</span>
                    <input
                      type="password"
                      value={currentPassword}
                      onChange={(event) => setCurrentPassword(event.target.value)}
                      required
                    />
                  </label>

                  <label className="account-field">
                    <span>Новый пароль</span>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                      minLength={6}
                      required
                    />
                  </label>

                  <label className="account-field">
                    <span>Повтор нового пароля</span>
                    <input
                      type="password"
                      value={repeatPassword}
                      onChange={(event) => setRepeatPassword(event.target.value)}
                      minLength={6}
                      required
                    />
                  </label>

                  <button type="submit" className="account-primary-btn" disabled={passwordSaving}>
                    {passwordSaving ? "Обновляем..." : "Обновить пароль"}
                  </button>

                  {passwordStatus && <div className="account-status">{passwordStatus}</div>}
                </div>
              </form>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

export default AccountPage;
