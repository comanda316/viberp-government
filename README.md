# San Andreas Government Portal

Публичный справочник: GitHub Pages, root → /docs. Общая приёмная с учётными записями: Node.js 24, команда `node backend/server.mjs`. Открыть http://127.0.0.1:18743. База SQLite хранится вне docs. PORTAL_DATA задаёт каталог базы. Для первого руководителя: `node backend/server.mjs invite "Правительство штата" manager`. Для сотрудника — employee. Приглашение действительно сутки. Для внешнего доступа требуется постоянный процесс Node, HTTPS reverse proxy и PORTAL_ORIGIN с адресом сервиса.

## GitHub Pages и общий API

Публикация интерфейса: ветка root, каталог /docs. Контейнер запускает API с Node.js 24. Смонтируйте постоянный диск в /data; для сохранения существующих учётных записей перенесите согласованную резервную копию SQLite. PORTAL_ORIGIN — HTTPS origin API. PORTAL_FRONTEND_URL — полный URL каталога Pages с завершающим слешем. В docs/hosting.js укажите HTTPS origin сервиса. Только публичный адрес помещается в репозиторий. Приглашения из CLI ведут на страницу кабинета Pages. Локальный режим по умолчанию использует тот же origin.
