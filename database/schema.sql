-- KSUP Database Schema
-- Corporate Project Management System for OOO "Chizh"
-- PostgreSQL

-- Create database (run this separately if needed)
-- CREATE DATABASE ksup_db;

-- Drop tables if they exist (for clean reinstall)
DROP TABLE IF EXISTS Time_entry CASCADE;
DROP TABLE IF EXISTS Assignment CASCADE;
DROP TABLE IF EXISTS Task CASCADE;
DROP TABLE IF EXISTS Project CASCADE;
DROP TABLE IF EXISTS Report CASCADE;
DROP TABLE IF EXISTS Status CASCADE;
DROP TABLE IF EXISTS Employee CASCADE;

-- Employees table
CREATE TABLE Employee (
   employee_id          SERIAL               PRIMARY KEY,
   fio                  VARCHAR(100)         NOT NULL,
   email                VARCHAR(100)         NOT NULL UNIQUE,
   phone                VARCHAR(11)          NOT NULL,
   hire_date            TIMESTAMP            NOT NULL,
   active               BOOLEAN              NOT NULL DEFAULT TRUE,
   role                 VARCHAR(50)          NOT NULL DEFAULT 'Исполнитель',
   password_hash        VARCHAR(255)         NOT NULL,
   CONSTRAINT CHK_Employee_Role CHECK (role IN ('Руководитель', 'PM', 'Исполнитель'))
);

-- Task statuses table
CREATE TABLE Status (
   status_id            SERIAL               PRIMARY KEY,
   name                 VARCHAR(100)         NOT NULL UNIQUE
);

-- Reports table
CREATE TABLE Report (
   report_id            SERIAL               PRIMARY KEY,
   report_type          VARCHAR(100)         NOT NULL,
   period_start         TIMESTAMP            NOT NULL,
   period_end           TIMESTAMP            NOT NULL,
   created_at           TIMESTAMP            NOT NULL DEFAULT CURRENT_TIMESTAMP,
   file_url             VARCHAR(2048)        NOT NULL
);

-- Projects table
CREATE TABLE Project (
   project_id           SERIAL               PRIMARY KEY,
   report_id            INT                  NULL REFERENCES Report(report_id),
   name                 VARCHAR(100)         NOT NULL,
   description          VARCHAR(1024)        NOT NULL DEFAULT '',
   budget_plan          DECIMAL(18,2)        NOT NULL DEFAULT 0,
   budget_fact          DECIMAL(18,2)        NOT NULL DEFAULT 0,
   start_plan           TIMESTAMP            NOT NULL,
   end_plan             TIMESTAMP            NOT NULL,
   start_actual         TIMESTAMP            NULL,
   end_actual           TIMESTAMP            NULL,
   priority             INT                  NOT NULL DEFAULT 3,
   is_archived          BOOLEAN              NOT NULL DEFAULT FALSE,
   CONSTRAINT CHK_Project_Priority CHECK (priority >= 1 AND priority <= 5),
   CONSTRAINT CHK_Project_Dates CHECK (end_plan >= start_plan)
);

-- Tasks table
CREATE TABLE Task (
   task_id              SERIAL               PRIMARY KEY,
   project_id           INT                  NULL REFERENCES Project(project_id),
   status_id            INT                  NULL REFERENCES Status(status_id),
   name                 VARCHAR(100)         NOT NULL,
   description          VARCHAR(1024)        NOT NULL DEFAULT '',
   priority             INT                  NOT NULL DEFAULT 3,
   start_plan           TIMESTAMP            NOT NULL,
   end_plan             TIMESTAMP            NOT NULL,
   effort_plan          DOUBLE PRECISION     NOT NULL DEFAULT 0,
   start_actual         TIMESTAMP            NULL,
   end_actual           TIMESTAMP            NULL,
   CONSTRAINT CHK_Task_Priority CHECK (priority >= 1 AND priority <= 5),
   CONSTRAINT CHK_Task_Dates CHECK (end_plan >= start_plan)
);

-- Employee assignments to tasks
CREATE TABLE Assignment (
   assignment_id        SERIAL               PRIMARY KEY,
   employee_id          INT                  NULL REFERENCES Employee(employee_id),
   task_id              INT                  NULL REFERENCES Task(task_id),
   role_on_task         VARCHAR(100)         NOT NULL,
   allocation_pct       INT                  NOT NULL DEFAULT 100,
   hourly_rate          DECIMAL(18,2)        NOT NULL DEFAULT 0,
   date_from            TIMESTAMP            NOT NULL,
   date_to              TIMESTAMP            NOT NULL,
   CONSTRAINT CHK_Assignment_Allocation CHECK (allocation_pct >= 1 AND allocation_pct <= 100),
   CONSTRAINT CHK_Assignment_Dates CHECK (date_to >= date_from)
);

-- Time tracking entries
CREATE TABLE Time_entry (
   time_entry_id        SERIAL               PRIMARY KEY,
   assignment_id        INT                  NULL REFERENCES Assignment(assignment_id),
   work_date            TIMESTAMP            NOT NULL,
   hours                DOUBLE PRECISION     NOT NULL,
   comment              VARCHAR(1024)        NOT NULL DEFAULT '',
   CONSTRAINT CHK_TimeEntry_Hours CHECK (hours >= 0.5 AND hours <= 24)
);

-- Create indexes for better performance
CREATE INDEX IX_Employee_Email ON Employee(email);
CREATE INDEX IX_Employee_Active ON Employee(active);
CREATE INDEX IX_Project_Archived ON Project(is_archived);
CREATE INDEX IX_Task_Project ON Task(project_id);
CREATE INDEX IX_Task_Status ON Task(status_id);
CREATE INDEX IX_Assignment_Employee ON Assignment(employee_id);
CREATE INDEX IX_Assignment_Task ON Assignment(task_id);
CREATE INDEX IX_TimeEntry_Assignment ON Time_entry(assignment_id);
CREATE INDEX IX_TimeEntry_Date ON Time_entry(work_date);
