import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Box,
    Paper,
    Typography,
    Grid,
    Card,
    CardContent,
    CardActions,
    Button,
    IconButton,
    TextField,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Chip,
    CircularProgress,
    InputAdornment,
    FormControlLabel,
    Switch,
    LinearProgress
} from '@mui/material';
import {
    Add as AddIcon,
    Edit as EditIcon,
    Delete as DeleteIcon,
    Archive as ArchiveIcon,
    Unarchive as UnarchiveIcon,
    Search as SearchIcon,
    Visibility as ViewIcon
} from '@mui/icons-material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { projectsApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import ConfirmDialog from '../components/ConfirmDialog';

const initialFormData = {
    name: '',
    description: '',
    budget_plan: 0,
    start_plan: new Date(),
    end_plan: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    priority: 3
};

const Projects = () => {
    const [projects, setProjects] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [showArchived, setShowArchived] = useState(false);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingProject, setEditingProject] = useState(null);
    const [formData, setFormData] = useState(initialFormData);
    const [formErrors, setFormErrors] = useState({});
    const [confirmDialog, setConfirmDialog] = useState({ open: false, project: null, action: '' });
    const { isManager } = useAuth();
    const { showSuccess, showError } = useNotification();
    const navigate = useNavigate();

    useEffect(() => {
        loadProjects();
    }, [search, showArchived]);

    const loadProjects = async () => {
        try {
            setLoading(true);
            const params = {};
            if (search) params.search = search;
            params.is_archived = showArchived;

            const response = await projectsApi.getAll(params);
            setProjects(response.data);
        } catch (error) {
            showError('Ошибка загрузки проектов');
        } finally {
            setLoading(false);
        }
    };

    const validateForm = () => {
        const errors = {};

        if (!formData.name.trim()) {
            errors.name = 'Название обязательно';
        }

        if (formData.budget_plan < 0) {
            errors.budget_plan = 'Бюджет не может быть отрицательным';
        }

        if (new Date(formData.end_plan) <= new Date(formData.start_plan)) {
            errors.end_plan = 'Дата окончания должна быть позже даты начала';
        }

        setFormErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const handleOpenDialog = (project = null) => {
        if (project) {
            setEditingProject(project);
            setFormData({
                name: project.name,
                description: project.description || '',
                budget_plan: project.budget_plan,
                start_plan: new Date(project.start_plan),
                end_plan: new Date(project.end_plan),
                priority: project.priority
            });
        } else {
            setEditingProject(null);
            setFormData(initialFormData);
        }
        setFormErrors({});
        setDialogOpen(true);
    };

    const handleCloseDialog = () => {
        setDialogOpen(false);
        setEditingProject(null);
        setFormData(initialFormData);
        setFormErrors({});
    };

    const handleSubmit = async () => {
        if (!validateForm()) return;

        try {
            const data = {
                ...formData,
                start_plan: formData.start_plan.toISOString(),
                end_plan: formData.end_plan.toISOString()
            };

            if (editingProject) {
                await projectsApi.update(editingProject.project_id, data);
                showSuccess('Проект обновлён');
            } else {
                await projectsApi.create(data);
                showSuccess('Проект создан');
            }
            handleCloseDialog();
            loadProjects();
        } catch (error) {
            showError(error.response?.data?.error || 'Ошибка сохранения');
        }
    };

    const handleAction = async () => {
        const { project, action } = confirmDialog;
        try {
            if (action === 'delete') {
                await projectsApi.delete(project.project_id);
                showSuccess('Проект удалён');
            } else if (action === 'archive') {
                await projectsApi.archive(project.project_id);
                showSuccess('Проект архивирован');
            } else if (action === 'unarchive') {
                await projectsApi.unarchive(project.project_id);
                showSuccess('Проект разархивирован');
            }
            loadProjects();
        } catch (error) {
            showError(error.response?.data?.error || 'Ошибка выполнения операции');
        }
        setConfirmDialog({ open: false, project: null, action: '' });
    };

    const getPriorityColor = (priority) => {
        if (priority >= 4) return 'error';
        if (priority >= 3) return 'warning';
        return 'success';
    };

    const getProgress = (project) => {
        if (project.task_count === 0) return 0;
        return Math.round((project.completed_tasks / project.task_count) * 100);
    };

    return (
        <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="h4">Проекты</Typography>
                {isManager() && (
                    <Button
                        variant="contained"
                        startIcon={<AddIcon />}
                        onClick={() => handleOpenDialog()}
                    >
                        Новый проект
                    </Button>
                )}
            </Box>

            <Paper sx={{ p: 2, mb: 2 }}>
                <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                    <TextField
                        placeholder="Поиск по названию"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        size="small"
                        sx={{ width: 300 }}
                        InputProps={{
                            startAdornment: (
                                <InputAdornment position="start">
                                    <SearchIcon />
                                </InputAdornment>
                            )
                        }}
                    />
                    <FormControlLabel
                        control={
                            <Switch
                                checked={showArchived}
                                onChange={(e) => setShowArchived(e.target.checked)}
                            />
                        }
                        label="Показать архивные"
                    />
                </Box>
            </Paper>

            {loading ? (
                <Box display="flex" justifyContent="center" p={4}>
                    <CircularProgress />
                </Box>
            ) : (
                <Grid container spacing={3}>
                    {projects.map((project) => (
                        <Grid item xs={12} sm={6} md={4} key={project.project_id}>
                            <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                                <CardContent sx={{ flexGrow: 1 }}>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                                        <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
                                            {project.name}
                                        </Typography>
                                        <Chip
                                            label={`P${project.priority}`}
                                            size="small"
                                            color={getPriorityColor(project.priority)}
                                        />
                                    </Box>

                                    {project.is_archived && (
                                        <Chip label="Архив" size="small" sx={{ mb: 1 }} />
                                    )}

                                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2, minHeight: 40 }}>
                                        {project.description?.substring(0, 100) || 'Без описания'}
                                        {project.description?.length > 100 ? '...' : ''}
                                    </Typography>

                                    <Box sx={{ mb: 1 }}>
                                        <Typography variant="caption" color="text.secondary">
                                            Прогресс: {project.completed_tasks} / {project.task_count} задач
                                        </Typography>
                                        <LinearProgress
                                            variant="determinate"
                                            value={getProgress(project)}
                                            sx={{ mt: 0.5 }}
                                        />
                                    </Box>

                                    <Typography variant="caption" display="block" color="text.secondary">
                                        Сроки: {new Date(project.start_plan).toLocaleDateString('ru-RU')} — {new Date(project.end_plan).toLocaleDateString('ru-RU')}
                                    </Typography>
                                    <Typography variant="caption" display="block" color="text.secondary">
                                        Бюджет: {project.budget_fact?.toLocaleString('ru-RU')} / {project.budget_plan?.toLocaleString('ru-RU')} руб.
                                    </Typography>
                                </CardContent>

                                <CardActions>
                                    <Button
                                        size="small"
                                        startIcon={<ViewIcon />}
                                        onClick={() => navigate(`/projects/${project.project_id}`)}
                                    >
                                        Открыть
                                    </Button>
                                    {isManager() && !project.is_archived && (
                                        <>
                                            <IconButton
                                                size="small"
                                                onClick={() => handleOpenDialog(project)}
                                                title="Редактировать"
                                            >
                                                <EditIcon />
                                            </IconButton>
                                            <IconButton
                                                size="small"
                                                onClick={() => setConfirmDialog({
                                                    open: true,
                                                    project,
                                                    action: 'archive'
                                                })}
                                                title="Архивировать"
                                            >
                                                <ArchiveIcon />
                                            </IconButton>
                                            <IconButton
                                                size="small"
                                                color="error"
                                                onClick={() => setConfirmDialog({
                                                    open: true,
                                                    project,
                                                    action: 'delete'
                                                })}
                                                title="Удалить"
                                            >
                                                <DeleteIcon />
                                            </IconButton>
                                        </>
                                    )}
                                    {isManager() && project.is_archived && (
                                        <IconButton
                                            size="small"
                                            onClick={() => setConfirmDialog({
                                                open: true,
                                                project,
                                                action: 'unarchive'
                                            })}
                                            title="Разархивировать"
                                        >
                                            <UnarchiveIcon />
                                        </IconButton>
                                    )}
                                </CardActions>
                            </Card>
                        </Grid>
                    ))}
                    {projects.length === 0 && (
                        <Grid item xs={12}>
                            <Paper sx={{ p: 4, textAlign: 'center' }}>
                                <Typography color="text.secondary">
                                    Проекты не найдены
                                </Typography>
                            </Paper>
                        </Grid>
                    )}
                </Grid>
            )}

            {/* Add/Edit Dialog */}
            <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
                <DialogTitle>
                    {editingProject ? 'Редактирование проекта' : 'Новый проект'}
                </DialogTitle>
                <DialogContent>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
                        <TextField
                            label="Название"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            error={!!formErrors.name}
                            helperText={formErrors.name}
                            required
                            fullWidth
                        />
                        <TextField
                            label="Описание"
                            value={formData.description}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                            multiline
                            rows={3}
                            fullWidth
                        />
                        <TextField
                            label="Плановый бюджет (руб.)"
                            type="number"
                            value={formData.budget_plan}
                            onChange={(e) => setFormData({ ...formData, budget_plan: parseFloat(e.target.value) || 0 })}
                            error={!!formErrors.budget_plan}
                            helperText={formErrors.budget_plan}
                            fullWidth
                        />
                        <DatePicker
                            label="Дата начала"
                            value={formData.start_plan}
                            onChange={(date) => setFormData({ ...formData, start_plan: date })}
                            slotProps={{ textField: { fullWidth: true } }}
                        />
                        <DatePicker
                            label="Дата окончания"
                            value={formData.end_plan}
                            onChange={(date) => setFormData({ ...formData, end_plan: date })}
                            slotProps={{
                                textField: {
                                    fullWidth: true,
                                    error: !!formErrors.end_plan,
                                    helperText: formErrors.end_plan
                                }
                            }}
                        />
                        <FormControl fullWidth>
                            <InputLabel>Приоритет</InputLabel>
                            <Select
                                value={formData.priority}
                                onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                                label="Приоритет"
                            >
                                <MenuItem value={1}>1 - Низкий</MenuItem>
                                <MenuItem value={2}>2</MenuItem>
                                <MenuItem value={3}>3 - Средний</MenuItem>
                                <MenuItem value={4}>4</MenuItem>
                                <MenuItem value={5}>5 - Высокий</MenuItem>
                            </Select>
                        </FormControl>
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseDialog}>Отмена</Button>
                    <Button onClick={handleSubmit} variant="contained">
                        {editingProject ? 'Сохранить' : 'Создать'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Confirm Dialog */}
            <ConfirmDialog
                open={confirmDialog.open}
                title={
                    confirmDialog.action === 'delete' ? 'Удаление проекта' :
                    confirmDialog.action === 'archive' ? 'Архивация проекта' : 'Разархивация проекта'
                }
                message={
                    confirmDialog.action === 'delete'
                        ? `Вы уверены, что хотите удалить проект "${confirmDialog.project?.name}"? Это действие нельзя отменить.`
                        : confirmDialog.action === 'archive'
                        ? `Вы уверены, что хотите архивировать проект "${confirmDialog.project?.name}"?`
                        : `Вы уверены, что хотите разархивировать проект "${confirmDialog.project?.name}"?`
                }
                confirmColor={confirmDialog.action === 'delete' ? 'error' : 'primary'}
                onConfirm={handleAction}
                onCancel={() => setConfirmDialog({ open: false, project: null, action: '' })}
            />
        </Box>
    );
};

export default Projects;
