# San Andreas Government Portal

Публичный справочник: GitHub Pages, root → /docs. Общая приёмная с учётными записями: Node.js 24, команда `node backend/server.mjs`. Открыть http://127.0.0.1:18743. База SQLite хранится вне docs. PORTAL_DATA задаёт каталог базы. Для первого руководителя: `node backend/server.mjs invite "Правительство штата" manager`. Для сотрудника — employee. Приглашение действительно сутки. Для внешнего доступа требуется постоянный процесс Node, HTTPS reverse proxy и PORTAL_ORIGIN с адресом сервиса.
