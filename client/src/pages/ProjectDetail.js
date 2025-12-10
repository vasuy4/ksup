import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Box,
    Paper,
    Typography,
    Grid,
    Card,
    CardContent,
    Button,
    Chip,
    CircularProgress,
    Divider,
    IconButton,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    TextField,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Tabs,
    Tab
} from '@mui/material';
import {
    ArrowBack as BackIcon,
    Add as AddIcon,
    Edit as EditIcon,
    Download as DownloadIcon
} from '@mui/icons-material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { projectsApi, tasksApi, statusesApi, reportsApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import KanbanBoard from '../components/KanbanBoard';

const ProjectDetail = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { isManager } = useAuth();
    const { showSuccess, showError } = useNotification();

    const [project, setProject] = useState(null);
    const [stats, setStats] = useState(null);
    const [kanban, setKanban] = useState({});
    const [statuses, setStatuses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [tabValue, setTabValue] = useState(0);
    const [taskDialogOpen, setTaskDialogOpen] = useState(false);
    const [editingTask, setEditingTask] = useState(null);
    const [taskFormData, setTaskFormData] = useState({
        name: '',
        description: '',
        priority: 3,
        start_plan: new Date(),
        end_plan: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        effort_plan: 8
    });

    useEffect(() => {
        loadData();
    }, [id]);

    const loadData = async () => {
        try {
            setLoading(true);
            const [projectRes, statsRes, kanbanRes, statusesRes] = await Promise.all([
                projectsApi.getById(id),
                projectsApi.getStats(id),
                tasksApi.getKanban(id),
                statusesApi.getAll()
            ]);

            setProject(projectRes.data);
            setStats(statsRes.data);
            setKanban(kanbanRes.data);
            setStatuses(statusesRes.data);
        } catch (error) {
            showError('Ошибка загрузки данных проекта');
        } finally {
            setLoading(false);
        }
    };

    const handleTaskStatusChange = async (taskId, newStatusId) => {
        try {
            await tasksApi.updateStatus(taskId, newStatusId);
            loadData();
            showSuccess('Статус задачи изменён');
        } catch (error) {
            showError('Ошибка изменения статуса');
        }
    };

    const handleOpenTaskDialog = (task = null) => {
        if (task) {
            setEditingTask(task);
            setTaskFormData({
                name: task.name,
                description: task.description || '',
                priority: task.priority,
                start_plan: new Date(task.start_plan),
                end_plan: new Date(task.end_plan),
                effort_plan: task.effort_plan
            });
        } else {
            setEditingTask(null);
            setTaskFormData({
                name: '',
                description: '',
                priority: 3,
                start_plan: new Date(),
                end_plan: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                effort_plan: 8
            });
        }
        setTaskDialogOpen(true);
    };

    const handleSaveTask = async () => {
        if (!taskFormData.name.trim()) {
            showError('Название задачи обязательно');
            return;
        }

        try {
            const data = {
                ...taskFormData,
                project_id: parseInt(id),
                start_plan: taskFormData.start_plan.toISOString(),
                end_plan: taskFormData.end_plan.toISOString()
            };

            if (editingTask) {
                await tasksApi.update(editingTask.task_id, data);
                showSuccess('Задача обновлена');
            } else {
                await tasksApi.create(data);
                showSuccess('Задача создана');
            }

            setTaskDialogOpen(false);
            loadData();
        } catch (error) {
            showError(error.response?.data?.error || 'Ошибка сохранения');
        }
    };

    const handleExportPdf = async () => {
        try {
            const response = await reportsApi.exportProjectPdf(id);
            const blob = new Blob([response.data], { type: 'application/pdf' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `project_${id}_report.pdf`;
            a.click();
            window.URL.revokeObjectURL(url);
            showSuccess('Отчёт экспортирован');
        } catch (error) {
            showError('Ошибка экспорта');
        }
    };

    const handleExportExcel = async () => {
        try {
            const response = await reportsApi.exportProjectExcel(id);
            const blob = new Blob([response.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `project_${id}_report.xlsx`;
            a.click();
            window.URL.revokeObjectURL(url);
            showSuccess('Отчёт экспортирован');
        } catch (error) {
            showError('Ошибка экспорта');
        }
    };

    if (loading) {
        return (
            <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
                <CircularProgress />
            </Box>
        );
    }

    if (!project) {
        return (
            <Box>
                <Typography>Проект не найден</Typography>
                <Button onClick={() => navigate('/projects')}>Назад к проектам</Button>
            </Box>
        );
    }

    return (
        <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
                <IconButton onClick={() => navigate('/projects')} sx={{ mr: 2 }}>
                    <BackIcon />
                </IconButton>
                <Typography variant="h4" sx={{ flexGrow: 1 }}>
                    {project.name}
                </Typography>
                {project.is_archived && <Chip label="Архив" sx={{ mr: 2 }} />}
                <Chip label={`P${project.priority}`} color="primary" />
            </Box>

            <Tabs value={tabValue} onChange={(e, v) => setTabValue(v)} sx={{ mb: 3 }}>
                <Tab label="Обзор" />
                <Tab label="Задачи" />
            </Tabs>

            {tabValue === 0 && (
                <Grid container spacing={3}>
                    <Grid item xs={12} md={8}>
                        <Paper sx={{ p: 3, mb: 3 }}>
                            <Typography variant="h6" gutterBottom>Описание</Typography>
                            <Typography>{project.description || 'Без описания'}</Typography>
                        </Paper>

                        <Paper sx={{ p: 3 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                                <Typography variant="h6">Статистика задач</Typography>
                                {isManager() && (
                                    <Box>
                                        <Button
                                            startIcon={<DownloadIcon />}
                                            onClick={handleExportPdf}
                                            sx={{ mr: 1 }}
                                        >
                                            PDF
                                        </Button>
                                        <Button
                                            startIcon={<DownloadIcon />}
                                            onClick={handleExportExcel}
                                        >
                                            Excel
                                        </Button>
                                    </Box>
                                )}
                            </Box>
                            <Grid container spacing={2}>
                                <Grid item xs={6} sm={4} md={2}>
                                    <Typography variant="h4" color="text.secondary">{stats?.total_tasks || 0}</Typography>
                                    <Typography variant="caption">Всего</Typography>
                                </Grid>
                                <Grid item xs={6} sm={4} md={2}>
                                    <Typography variant="h4" color="info.main">{stats?.new_tasks || 0}</Typography>
                                    <Typography variant="caption">Создано</Typography>
                                </Grid>
                                <Grid item xs={6} sm={4} md={2}>
                                    <Typography variant="h4" color="primary.main">{stats?.in_progress_tasks || 0}</Typography>
                                    <Typography variant="caption">В работе</Typography>
                                </Grid>
                                <Grid item xs={6} sm={4} md={2}>
                                    <Typography variant="h4" color="warning.main">{stats?.review_tasks || 0}</Typography>
                                    <Typography variant="caption">На проверке</Typography>
                                </Grid>
                                <Grid item xs={6} sm={4} md={2}>
                                    <Typography variant="h4" color="success.main">{stats?.completed_tasks || 0}</Typography>
                                    <Typography variant="caption">Завершено</Typography>
                                </Grid>
                            </Grid>
                        </Paper>
                    </Grid>

                    <Grid item xs={12} md={4}>
                        <Paper sx={{ p: 3, mb: 3 }}>
                            <Typography variant="h6" gutterBottom>Сроки</Typography>
                            <Typography variant="body2" color="text.secondary">План. начало</Typography>
                            <Typography gutterBottom>{new Date(project.start_plan).toLocaleDateString('ru-RU')}</Typography>
                            <Typography variant="body2" color="text.secondary">План. окончание</Typography>
                            <Typography gutterBottom>{new Date(project.end_plan).toLocaleDateString('ru-RU')}</Typography>
                            {project.start_actual && (
                                <>
                                    <Typography variant="body2" color="text.secondary">Факт. начало</Typography>
                                    <Typography gutterBottom>{new Date(project.start_actual).toLocaleDateString('ru-RU')}</Typography>
                                </>
                            )}
                        </Paper>

                        <Paper sx={{ p: 3, mb: 3 }}>
                            <Typography variant="h6" gutterBottom>Бюджет</Typography>
                            <Typography variant="body2" color="text.secondary">Плановый</Typography>
                            <Typography gutterBottom>{project.budget_plan?.toLocaleString('ru-RU')} руб.</Typography>
                            <Typography variant="body2" color="text.secondary">Фактический</Typography>
                            <Typography gutterBottom>{project.budget_fact?.toLocaleString('ru-RU')} руб.</Typography>
                            <Divider sx={{ my: 1 }} />
                            <Typography variant="body2" color="text.secondary">Отклонение</Typography>
                            <Typography color={(project.budget_plan - project.budget_fact) >= 0 ? 'success.main' : 'error.main'}>
                                {((project.budget_plan - project.budget_fact) >= 0 ? '+' : '')}{(project.budget_plan - project.budget_fact)?.toLocaleString('ru-RU')} руб.
                            </Typography>
                        </Paper>

                        <Paper sx={{ p: 3 }}>
                            <Typography variant="h6" gutterBottom>Трудозатраты</Typography>
                            <Typography variant="body2" color="text.secondary">Плановые</Typography>
                            <Typography gutterBottom>{stats?.effort_plan_total || 0} ч.</Typography>
                            <Typography variant="body2" color="text.secondary">Фактические</Typography>
                            <Typography gutterBottom>{stats?.effort_fact_total || 0} ч.</Typography>
                        </Paper>
                    </Grid>
                </Grid>
            )}

            {tabValue === 1 && (
                <Box>
                    {isManager() && !project.is_archived && (
                        <Box sx={{ mb: 2 }}>
                            <Button
                                variant="contained"
                                startIcon={<AddIcon />}
                                onClick={() => handleOpenTaskDialog()}
                            >
                                Новая задача
                            </Button>
                        </Box>
                    )}

                    <KanbanBoard
                        kanban={kanban}
                        statuses={statuses}
                        onStatusChange={handleTaskStatusChange}
                        onTaskClick={(task) => navigate(`/tasks/${task.task_id}`)}
                        onEditTask={isManager() && !project.is_archived ? handleOpenTaskDialog : null}
                    />
                </Box>
            )}

            {/* Task Dialog */}
            <Dialog open={taskDialogOpen} onClose={() => setTaskDialogOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>
                    {editingTask ? 'Редактирование задачи' : 'Новая задача'}
                </DialogTitle>
                <DialogContent>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
                        <TextField
                            label="Название"
                            value={taskFormData.name}
                            onChange={(e) => setTaskFormData({ ...taskFormData, name: e.target.value })}
                            required
                            fullWidth
                        />
                        <TextField
                            label="Описание"
                            value={taskFormData.description}
                            onChange={(e) => setTaskFormData({ ...taskFormData, description: e.target.value })}
                            multiline
                            rows={3}
                            fullWidth
                        />
                        <FormControl fullWidth>
                            <InputLabel>Приоритет</InputLabel>
                            <Select
                                value={taskFormData.priority}
                                onChange={(e) => setTaskFormData({ ...taskFormData, priority: e.target.value })}
                                label="Приоритет"
                            >
                                <MenuItem value={1}>1 - Низкий</MenuItem>
                                <MenuItem value={2}>2</MenuItem>
                                <MenuItem value={3}>3 - Средний</MenuItem>
                                <MenuItem value={4}>4</MenuItem>
                                <MenuItem value={5}>5 - Высокий</MenuItem>
                            </Select>
                        </FormControl>
                        <DatePicker
                            label="Дата начала"
                            value={taskFormData.start_plan}
                            onChange={(date) => setTaskFormData({ ...taskFormData, start_plan: date })}
                            slotProps={{ textField: { fullWidth: true } }}
                        />
                        <DatePicker
                            label="Дата окончания"
                            value={taskFormData.end_plan}
                            onChange={(date) => setTaskFormData({ ...taskFormData, end_plan: date })}
                            slotProps={{ textField: { fullWidth: true } }}
                        />
                        <TextField
                            label="Плановые трудозатраты (часы)"
                            type="number"
                            value={taskFormData.effort_plan}
                            onChange={(e) => setTaskFormData({ ...taskFormData, effort_plan: parseFloat(e.target.value) || 0 })}
                            fullWidth
                        />
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setTaskDialogOpen(false)}>Отмена</Button>
                    <Button onClick={handleSaveTask} variant="contained">
                        {editingTask ? 'Сохранить' : 'Создать'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default ProjectDetail;
