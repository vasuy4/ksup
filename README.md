# КСУП — Корпоративная система управления проектами

Веб-приложение для управления проектами компании ООО "Чиж".

**Стек технологий:** React + Node.js/Express + SQL Server 2017

## Структура проекта

```
/ksup
├── /client                 # React frontend
│   ├── /src
│   │   ├── /components     # UI компоненты
│   │   ├── /pages          # Страницы приложения
│   │   ├── /services       # API вызовы
│   │   ├── /context        # React Context (Auth, Notifications)
│   │   └── /utils          # Вспомогательные функции
├── /server                 # Node.js backend
│   ├── /config             # Конфигурация БД
│   ├── /controllers        # Контроллеры
│   ├── /middleware         # Middleware (авторизация)
│   ├── /routes             # API маршруты
│   └── /services           # Бизнес-логика
├── /database               # SQL скрипты
│   ├── schema.sql          # Создание таблиц
│   └── seed.sql            # Тестовые данные
└── README.md               # Инструкция по запуску
```

## Требования

- Node.js 18+ (рекомендуется 20.x)
- SQL Server 2017 или выше
- npm или yarn

## Установка и запуск

### 1. Клонирование репозитория

```bash
git clone <repository-url>
cd ksup
```

### 2. Настройка базы данных

1. Откройте SQL Server Management Studio (SSMS)
2. Подключитесь к вашему экземпляру SQL Server
3. Выполните скрипт создания базы данных:
   ```sql
   -- Откройте и выполните файл database/schema.sql
   ```
4. Загрузите тестовые данные:
   ```sql
   -- Откройте и выполните файл database/seed.sql
   ```

### 3. Настройка подключения к БД

Отредактируйте файл `server/config/database.js` или создайте файл `.env` в папке `server`:

```env
DB_SERVER=localhost
DB_NAME=KSUP_DB
DB_USER=sa
DB_PASSWORD=YOUR_PASSWORD
DB_PORT=1433
JWT_SECRET=your-secret-key
PORT=5000
```

### 4. Установка зависимостей

```bash
# Установка зависимостей сервера
cd server
npm install

# Установка зависимостей клиента
cd ../client
npm install
```

### 5. Запуск приложения

#### Режим разработки

Откройте два терминала:

**Терминал 1 — Сервер:**
```bash
cd server
npm run dev
```

**Терминал 2 — Клиент:**
```bash
cd client
npm start
```

Приложение будет доступно по адресу: http://localhost:3000

#### Продакшн сборка

```bash
# Сборка клиента
cd client
npm run build

# Запуск сервера
cd ../server
npm start
```

## Тестовые аккаунты

После выполнения seed.sql доступны следующие учётные записи:

| Роль | Email | Пароль |
|------|-------|--------|
| Руководитель | ivanov@chizh.ru | 123456 |
| PM | petrova@chizh.ru | 123456 |
| Исполнитель | sidorov@chizh.ru | 123456 |

## Роли и права доступа

### Руководитель
- Полный доступ ко всем функциям
- Управление сотрудниками
- Управление проектами и задачами
- Просмотр всех отчётов

### PM (Проектный менеджер)
- Управление сотрудниками
- Создание и редактирование проектов
- Создание и редактирование задач
- Назначение исполнителей на задачи
- Просмотр отчётов

### Исполнитель
- Просмотр назначенных задач
- Изменение статуса своих задач
- Списание трудозатрат на свои задачи
- Просмотр своей истории трудозатрат

## Функциональные возможности

### Авторизация
- Вход по email и паролю
- JWT токены для аутентификации
- Автоматический выход при истечении токена

### Управление сотрудниками
- Список сотрудников с поиском и фильтрацией
- Добавление/редактирование сотрудников
- Деактивация/активация сотрудников
- Валидация email и телефона

### Управление проектами
- Список проектов с фильтрами
- Карточки проектов с прогрессом
- Создание/редактирование проектов
- Архивация проектов (без активных задач)
- Защита от удаления проектов с задачами

### Управление задачами
- Канбан-доска по статусам (drag & drop)
- Создание/редактирование задач
- Изменение статуса задачи
- Назначение исполнителей
- Просмотр трудозатрат по задаче

### Учёт трудозатрат
- Списание времени на задачи
- Валидация: 0.5-24 часа
- Запрет списания за дату более 7 дней назад
- История списаний с фильтрацией

### Отчёты
- Отчёт по проекту (статистика, бюджет, трудозатраты)
- Отчёт по загрузке сотрудников
- Графики и диаграммы
- Экспорт в PDF и Excel (XLSX)

## API Endpoints

### Авторизация
- `POST /api/auth/login` — вход
- `GET /api/auth/me` — текущий пользователь
- `POST /api/auth/change-password` — смена пароля

### Сотрудники
- `GET /api/employees` — список сотрудников
- `GET /api/employees/:id` — сотрудник по ID
- `POST /api/employees` — создание сотрудника
- `PUT /api/employees/:id` — обновление сотрудника
- `PATCH /api/employees/:id/deactivate` — деактивация
- `PATCH /api/employees/:id/activate` — активация

### Проекты
- `GET /api/projects` — список проектов
- `GET /api/projects/:id` — проект по ID
- `GET /api/projects/:id/stats` — статистика проекта
- `POST /api/projects` — создание проекта
- `PUT /api/projects/:id` — обновление проекта
- `PATCH /api/projects/:id/archive` — архивация
- `PATCH /api/projects/:id/unarchive` — разархивация
- `DELETE /api/projects/:id` — удаление

### Задачи
- `GET /api/tasks` — список задач
- `GET /api/tasks/:id` — задача по ID
- `GET /api/tasks/project/:projectId/kanban` — канбан-доска
- `POST /api/tasks` — создание задачи
- `PUT /api/tasks/:id` — обновление задачи
- `PATCH /api/tasks/:id/status` — изменение статуса
- `DELETE /api/tasks/:id` — удаление

### Назначения
- `GET /api/assignments/task/:taskId` — назначения по задаче
- `GET /api/assignments/my` — мои назначения
- `POST /api/assignments` — создание назначения
- `PUT /api/assignments/:id` — обновление назначения
- `DELETE /api/assignments/:id` — удаление назначения

### Трудозатраты
- `GET /api/time-entries/my` — мои записи
- `GET /api/time-entries/task/:taskId` — записи по задаче
- `POST /api/time-entries` — списание времени
- `PUT /api/time-entries/:id` — обновление записи
- `DELETE /api/time-entries/:id` — удаление записи

### Отчёты
- `GET /api/reports/project/:projectId` — отчёт по проекту
- `GET /api/reports/project/:projectId/pdf` — экспорт в PDF
- `GET /api/reports/project/:projectId/excel` — экспорт в Excel
- `GET /api/reports/workload` — отчёт по загрузке
- `GET /api/reports/workload/excel` — экспорт загрузки в Excel

## Статусы задач

1. **Создана** — задача создана, работа не начата
2. **В работе** — задача в процессе выполнения
3. **На проверке** — задача выполнена, ожидает проверки
4. **Завершена** — задача полностью завершена
5. **Отменена** — задача отменена

## Технические особенности

- **Frontend:** React 18, Material UI 5, React Router 6, Axios, Recharts
- **Backend:** Express.js 4, mssql, bcryptjs, jsonwebtoken, express-validator
- **Экспорт:** PDFKit (PDF), ExcelJS (XLSX)
- **Аутентификация:** JWT с хранением в localStorage

## Разработка

### Структура компонентов React

```
src/
├── components/
│   ├── Layout.js          # Основной layout с меню
│   ├── ConfirmDialog.js   # Диалог подтверждения
│   └── KanbanBoard.js     # Канбан-доска
├── context/
│   ├── AuthContext.js     # Контекст авторизации
│   └── NotificationContext.js # Уведомления
├── pages/
│   ├── Login.js           # Страница входа
│   ├── Dashboard.js       # Главная страница
│   ├── Employees.js       # Сотрудники
│   ├── Projects.js        # Проекты
│   ├── ProjectDetail.js   # Детали проекта
│   ├── Tasks.js           # Задачи
│   ├── TaskDetail.js      # Детали задачи
│   ├── TimeTracking.js    # Учёт времени
│   └── Reports.js         # Отчёты
└── services/
    └── api.js             # API клиент
```

## Лицензия

Проприетарное программное обеспечение ООО "Чиж".
