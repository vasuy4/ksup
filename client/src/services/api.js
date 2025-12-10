import axios from 'axios';

const api = axios.create({
    baseURL: '/api',
    headers: {
        'Content-Type': 'application/json'
    }
});

// Add token to requests
api.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Handle 401 errors
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            window.location.href = '/login';
        }
        return Promise.reject(error);
    }
);

// Auth API
export const authApi = {
    login: (email, password) => api.post('/auth/login', { email, password }),
    getMe: () => api.get('/auth/me'),
    changePassword: (currentPassword, newPassword) =>
        api.post('/auth/change-password', { currentPassword, newPassword })
};

// Employees API
export const employeesApi = {
    getAll: (params) => api.get('/employees', { params }),
    getById: (id) => api.get(`/employees/${id}`),
    create: (data) => api.post('/employees', data),
    update: (id, data) => api.put(`/employees/${id}`, data),
    deactivate: (id) => api.patch(`/employees/${id}/deactivate`),
    activate: (id) => api.patch(`/employees/${id}/activate`)
};

// Projects API
export const projectsApi = {
    getAll: (params) => api.get('/projects', { params }),
    getById: (id) => api.get(`/projects/${id}`),
    getStats: (id) => api.get(`/projects/${id}/stats`),
    create: (data) => api.post('/projects', data),
    update: (id, data) => api.put(`/projects/${id}`, data),
    archive: (id) => api.patch(`/projects/${id}/archive`),
    unarchive: (id) => api.patch(`/projects/${id}/unarchive`),
    delete: (id) => api.delete(`/projects/${id}`)
};

// Tasks API
export const tasksApi = {
    getAll: (params) => api.get('/tasks', { params }),
    getById: (id) => api.get(`/tasks/${id}`),
    getKanban: (projectId) => api.get(`/tasks/project/${projectId}/kanban`),
    create: (data) => api.post('/tasks', data),
    update: (id, data) => api.put(`/tasks/${id}`, data),
    updateStatus: (id, status_id) => api.patch(`/tasks/${id}/status`, { status_id }),
    delete: (id) => api.delete(`/tasks/${id}`)
};

// Statuses API
export const statusesApi = {
    getAll: () => api.get('/statuses')
};

// Assignments API
export const assignmentsApi = {
    getByTask: (taskId) => api.get(`/assignments/task/${taskId}`),
    getByEmployee: (employeeId) => api.get(`/assignments/employee/${employeeId}`),
    getMy: () => api.get('/assignments/my'),
    create: (data) => api.post('/assignments', data),
    update: (id, data) => api.put(`/assignments/${id}`, data),
    delete: (id) => api.delete(`/assignments/${id}`)
};

// Time Entries API
export const timeEntriesApi = {
    getByAssignment: (assignmentId) => api.get(`/time-entries/assignment/${assignmentId}`),
    getByTask: (taskId) => api.get(`/time-entries/task/${taskId}`),
    getMy: (params) => api.get('/time-entries/my', { params }),
    create: (data) => api.post('/time-entries', data),
    update: (id, data) => api.put(`/time-entries/${id}`, data),
    delete: (id) => api.delete(`/time-entries/${id}`)
};

// Reports API
export const reportsApi = {
    getProjectReport: (projectId) => api.get(`/reports/project/${projectId}`),
    getWorkloadReport: (params) => api.get('/reports/workload', { params }),
    exportProjectPdf: (projectId) =>
        api.get(`/reports/project/${projectId}/pdf`, { responseType: 'blob' }),
    exportProjectExcel: (projectId) =>
        api.get(`/reports/project/${projectId}/excel`, { responseType: 'blob' }),
    exportWorkloadExcel: (params) =>
        api.get('/reports/workload/excel', { params, responseType: 'blob' })
};

export default api;
