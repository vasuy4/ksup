import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Box,
    Paper,
    Typography,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Button,
    IconButton,
    TextField,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Chip,
    CircularProgress,
    InputAdornment
} from '@mui/material';
import {
    Add as AddIcon,
    Visibility as ViewIcon,
    Search as SearchIcon
} from '@mui/icons-material';
import { tasksApi, projectsApi, statusesApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';

const Tasks = () => {
    const [tasks, setTasks] = useState([]);
    const [projects, setProjects] = useState([]);
    const [statuses, setStatuses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState({
        search: '',
        project_id: '',
        status_id: ''
    });
    const { isManager } = useAuth();
    const { showError } = useNotification();
    const navigate = useNavigate();

    useEffect(() => {
        loadInitialData();
    }, []);

    useEffect(() => {
        loadTasks();
    }, [filters]);

    const loadInitialData = async () => {
        try {
            const [projectsRes, statusesRes] = await Promise.all([
                projectsApi.getAll({ is_archived: false }),
                statusesApi.getAll()
            ]);
            setProjects(projectsRes.data);
            setStatuses(statusesRes.data);
        } catch (error) {
            showError('Ошибка загрузки данных');
        }
    };

    const loadTasks = async () => {
        try {
            setLoading(true);
            const params = {};
            if (filters.search) params.search = filters.search;
            if (filters.project_id) params.project_id = filters.project_id;
            if (filters.status_id) params.status_id = filters.status_id;

            const response = await tasksApi.getAll(params);
            setTasks(response.data);
        } catch (error) {
            showError('Ошибка загрузки задач');
        } finally {
            setLoading(false);
        }
    };

    const getPriorityColor = (priority) => {
        if (priority >= 4) return 'error';
        if (priority >= 3) return 'warning';
        return 'success';
    };

    const getStatusColor = (statusName) => {
        switch (statusName) {
            case 'Создана': return 'default';
            case 'В работе': return 'primary';
            case 'На проверке': return 'warning';
            case 'Завершена': return 'success';
            case 'Отменена': return 'error';
            default: return 'default';
        }
    };

    return (
        <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="h4">Задачи</Typography>
                {isManager() && (
                    <Button
                        variant="contained"
                        startIcon={<AddIcon />}
                        onClick={() => navigate('/projects')}
                    >
                        Создать задачу
                    </Button>
                )}
            </Box>

            <Paper sx={{ p: 2, mb: 2 }}>
                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
                    <TextField
                        placeholder="Поиск по названию"
                        value={filters.search}
                        onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                        size="small"
                        sx={{ width: 250 }}
                        InputProps={{
                            startAdornment: (
                                <InputAdornment position="start">
                                    <SearchIcon />
                                </InputAdornment>
                            )
                        }}
                    />
                    <FormControl size="small" sx={{ minWidth: 200 }}>
                        <InputLabel>Проект</InputLabel>
                        <Select
                            value={filters.project_id}
                            onChange={(e) => setFilters({ ...filters, project_id: e.target.value })}
                            label="Проект"
                        >
                            <MenuItem value="">Все проекты</MenuItem>
                            {projects.map(project => (
                                <MenuItem key={project.project_id} value={project.project_id}>
                                    {project.name}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                    <FormControl size="small" sx={{ minWidth: 150 }}>
                        <InputLabel>Статус</InputLabel>
                        <Select
                            value={filters.status_id}
                            onChange={(e) => setFilters({ ...filters, status_id: e.target.value })}
                            label="Статус"
                        >
                            <MenuItem value="">Все статусы</MenuItem>
                            {statuses.map(status => (
                                <MenuItem key={status.status_id} value={status.status_id}>
                                    {status.name}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                    <Button
                        variant="outlined"
                        onClick={() => setFilters({ search: '', project_id: '', status_id: '' })}
                    >
                        Сбросить
                    </Button>
                </Box>
            </Paper>

            <TableContainer component={Paper}>
                {loading ? (
                    <Box display="flex" justifyContent="center" p={4}>
                        <CircularProgress />
                    </Box>
                ) : (
                    <Table>
                        <TableHead>
                            <TableRow>
                                <TableCell>Название</TableCell>
                                <TableCell>Проект</TableCell>
                                <TableCell>Статус</TableCell>
                                <TableCell>Приоритет</TableCell>
                                <TableCell>Исполнители</TableCell>
                                <TableCell>Срок</TableCell>
                                <TableCell align="right">Действия</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {tasks.map((task) => (
                                <TableRow key={task.task_id}>
                                    <TableCell>{task.name}</TableCell>
                                    <TableCell>{task.project_name}</TableCell>
                                    <TableCell>
                                        <Chip
                                            label={task.status_name}
                                            size="small"
                                            color={getStatusColor(task.status_name)}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <Chip
                                            label={`P${task.priority}`}
                                            size="small"
                                            color={getPriorityColor(task.priority)}
                                        />
                                    </TableCell>
                                    <TableCell>{task.assignees || '-'}</TableCell>
                                    <TableCell>
                                        {new Date(task.end_plan).toLocaleDateString('ru-RU')}
                                    </TableCell>
                                    <TableCell align="right">
                                        <IconButton
                                            onClick={() => navigate(`/tasks/${task.task_id}`)}
                                            title="Просмотр"
                                        >
                                            <ViewIcon />
                                        </IconButton>
                                    </TableCell>
                                </TableRow>
                            ))}
                            {tasks.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={7} align="center">
                                        Задачи не найдены
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                )}
            </TableContainer>
        </Box>
    );
};

export default Tasks;
