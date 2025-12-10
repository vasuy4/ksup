-- KSUP Database Schema
-- Corporate Project Management System for OOO "Chizh"
-- SQL Server 2017

-- Create database
IF NOT EXISTS (SELECT * FROM sys.databases WHERE name = 'KSUP_DB')
BEGIN
    CREATE DATABASE KSUP_DB;
END
GO

USE KSUP_DB;
GO

-- Drop tables if they exist (for clean reinstall)
IF OBJECT_ID('Time_entry', 'U') IS NOT NULL DROP TABLE Time_entry;
IF OBJECT_ID('Assignment', 'U') IS NOT NULL DROP TABLE Assignment;
IF OBJECT_ID('Task', 'U') IS NOT NULL DROP TABLE Task;
IF OBJECT_ID('Project', 'U') IS NOT NULL DROP TABLE Project;
IF OBJECT_ID('Report', 'U') IS NOT NULL DROP TABLE Report;
IF OBJECT_ID('Status', 'U') IS NOT NULL DROP TABLE Status;
IF OBJECT_ID('Employee', 'U') IS NOT NULL DROP TABLE Employee;
GO

-- Employees table
CREATE TABLE Employee (
   employee_id          INT                  NOT NULL PRIMARY KEY,
   fio                  VARCHAR(100)         NOT NULL,
   email                VARCHAR(100)         NOT NULL UNIQUE,
   phone                VARCHAR(11)          NOT NULL,
   hire_date            DATETIME             NOT NULL,
   active               BIT                  NOT NULL DEFAULT 1,
   role                 VARCHAR(50)          NOT NULL DEFAULT 'Исполнитель',
   password_hash        VARCHAR(255)         NOT NULL,
   CONSTRAINT CHK_Employee_Role CHECK (role IN ('Руководитель', 'PM', 'Исполнитель'))
);
GO

-- Task statuses table
CREATE TABLE Status (
   status_id            INT                  NOT NULL PRIMARY KEY,
   name                 VARCHAR(100)         NOT NULL UNIQUE
);
GO

-- Reports table
CREATE TABLE Report (
   report_id            INT                  NOT NULL PRIMARY KEY,
   report_type          VARCHAR(100)         NOT NULL,
   period_start         DATETIME             NOT NULL,
   period_end           DATETIME             NOT NULL,
   created_at           DATETIME             NOT NULL DEFAULT GETDATE(),
   file_url             VARCHAR(2048)        NOT NULL
);
GO

-- Projects table
CREATE TABLE Project (
   project_id           INT                  NOT NULL PRIMARY KEY,
   report_id            INT                  NULL REFERENCES Report(report_id),
   name                 VARCHAR(100)         NOT NULL,
   description          VARCHAR(1024)        NOT NULL DEFAULT '',
   budget_plan          DECIMAL(18,2)        NOT NULL DEFAULT 0,
   budget_fact          DECIMAL(18,2)        NOT NULL DEFAULT 0,
   start_plan           DATETIME             NOT NULL,
   end_plan             DATETIME             NOT NULL,
   start_actual         DATETIME             NULL,
   end_actual           DATETIME             NULL,
   priority             INT                  NOT NULL DEFAULT 3,
   is_archived          BIT                  NOT NULL DEFAULT 0,
   CONSTRAINT CHK_Project_Priority CHECK (priority >= 1 AND priority <= 5),
   CONSTRAINT CHK_Project_Dates CHECK (end_plan >= start_plan)
);
GO

-- Tasks table
CREATE TABLE Task (
   task_id              INT                  NOT NULL PRIMARY KEY,
   project_id           INT                  NULL REFERENCES Project(project_id),
   status_id            INT                  NULL REFERENCES Status(status_id),
   name                 VARCHAR(100)         NOT NULL,
   description          VARCHAR(1024)        NOT NULL DEFAULT '',
   priority             INT                  NOT NULL DEFAULT 3,
   start_plan           DATETIME             NOT NULL,
   end_plan             DATETIME             NOT NULL,
   effort_plan          FLOAT                NOT NULL DEFAULT 0,
   start_actual         DATETIME             NULL,
   end_actual           DATETIME             NULL,
   CONSTRAINT CHK_Task_Priority CHECK (priority >= 1 AND priority <= 5),
   CONSTRAINT CHK_Task_Dates CHECK (end_plan >= start_plan)
);
GO

-- Employee assignments to tasks
CREATE TABLE Assignment (
   assignment_id        INT                  NOT NULL PRIMARY KEY,
   employee_id          INT                  NULL REFERENCES Employee(employee_id),
   task_id              INT                  NULL REFERENCES Task(task_id),
   role_on_task         VARCHAR(100)         NOT NULL,
   allocation_pct       INT                  NOT NULL DEFAULT 100,
   hourly_rate          DECIMAL(18,2)        NOT NULL DEFAULT 0,
   date_from            DATETIME             NOT NULL,
   date_to              DATETIME             NOT NULL,
   CONSTRAINT CHK_Assignment_Allocation CHECK (allocation_pct >= 1 AND allocation_pct <= 100),
   CONSTRAINT CHK_Assignment_Dates CHECK (date_to >= date_from)
);
GO

-- Time tracking entries
CREATE TABLE Time_entry (
   time_entry_id        INT                  NOT NULL PRIMARY KEY,
   assignment_id        INT                  NULL REFERENCES Assignment(assignment_id),
   work_date            DATETIME             NOT NULL,
   hours                FLOAT                NOT NULL,
   comment              VARCHAR(1024)        NOT NULL DEFAULT '',
   CONSTRAINT CHK_TimeEntry_Hours CHECK (hours >= 0.5 AND hours <= 24)
);
GO

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
GO

PRINT 'KSUP database schema created successfully.';
GO
