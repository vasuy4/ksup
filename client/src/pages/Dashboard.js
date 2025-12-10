import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Grid,
    Paper,
    Typography,
    Box,
    Card,
    CardContent,
    CardActions,
    Button,
    Chip,
    List,
    ListItem,
    ListItemText,
    Divider,
    CircularProgress
} from '@mui/material';
import {
    Folder as FolderIcon,
    Assignment as TaskIcon,
    AccessTime as TimeIcon,
    TrendingUp as TrendingIcon
} from '@mui/icons-material';
import { projectsApi, assignmentsApi, timeEntriesApi } from '../services/api';
import { useAuth } from '../context/AuthContext';

const StatCard = ({ title, value, icon, color }) => (
    <Card sx={{ height: '100%' }}>
        <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <Box
                    sx={{
                        p: 1,
                        borderRadius: 1,
                        backgroundColor: `${color}.light`,
                        color: `${color}.main`,
                        mr: 2
                    }}
                >
                    {icon}
                </Box>
                <Typography variant="h6" color="text.secondary">
                    {title}
                </Typography>
            </Box>
            <Typography variant="h3" component="div">
                {value}
            </Typography>
        </CardContent>
    </Card>
);

const Dashboard = () => {
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({
        projects: 0,
        tasks: 0,
        hoursToday: 0,
        hoursWeek: 0
    });
    const [myTasks, setMyTasks] = useState([]);
    const [recentProjects, setRecentProjects] = useState([]);
    const { user, isManager } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            setLoading(true);

            // Load projects
            const projectsRes = await projectsApi.getAll({ is_archived: false });
            setRecentProjects(projectsRes.data.slice(0, 5));

            // Load my assignments
            const assignmentsRes = await assignmentsApi.getMy();
            const activeTasks = assignmentsRes.data.filter(
                a => a.status_name !== 'Завершена' && a.status_name !== 'Отменена'
            );
            setMyTasks(activeTasks.slice(0, 5));

            // Load time entries
            const today = new Date();
            const weekAgo = new Date(today);
            weekAgo.setDate(weekAgo.getDate() - 7);

            const timeRes = await timeEntriesApi.getMy({
                start_date: weekAgo.toISOString(),
                end_date: today.toISOString()
            });

            const todayStr = today.toISOString().split('T')[0];
            const hoursToday = timeRes.data
                .filter(te => te.work_date.split('T')[0] === todayStr)
                .reduce((sum, te) => sum + te.hours, 0);

            const hoursWeek = timeRes.data.reduce((sum, te) => sum + te.hours, 0);

            setStats({
                projects: projectsRes.data.length,
                tasks: activeTasks.length,
                hoursToday,
                hoursWeek
            });
        } catch (error) {
            console.error('Error loading dashboard data:', error);
        } finally {
            setLoading(false);
        }
    };

    const getPriorityColor = (priority) => {
        if (priority >= 4) return 'error';
        if (priority >= 3) return 'warning';
        return 'success';
    };

    if (loading) {
        return (
            <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
                <CircularProgress />
            </Box>
        );
    }

    return (
        <Box>
            <Typography variant="h4" gutterBottom>
                Добро пожаловать, {user?.fio?.split(' ')[1] || user?.fio}!
            </Typography>
            <Typography variant="body1" color="text.secondary" gutterBottom>
                {isManager() ? 'Обзор проектов и задач' : 'Ваши активные задачи'}
            </Typography>

            <Grid container spacing={3} sx={{ mt: 1 }}>
                {/* Stats Cards */}
                <Grid item xs={12} sm={6} md={3}>
                    <StatCard
                        title="Проекты"
                        value={stats.projects}
                        icon={<FolderIcon />}
                        color="primary"
                    />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                    <StatCard
                        title="Мои задачи"
                        value={stats.tasks}
                        icon={<TaskIcon />}
                        color="secondary"
                    />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                    <StatCard
                        title="Часов сегодня"
                        value={stats.hoursToday}
                        icon={<TimeIcon />}
                        color="success"
                    />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                    <StatCard
                        title="Часов за неделю"
                        value={stats.hoursWeek}
                        icon={<TrendingIcon />}
                        color="info"
                    />
                </Grid>

                {/* My Tasks */}
                <Grid item xs={12} md={6}>
                    <Paper sx={{ p: 2, height: '100%' }}>
                        <Typography variant="h6" gutterBottom>
                            Мои задачи
                        </Typography>
                        {myTasks.length === 0 ? (
                            <Typography color="text.secondary">
                                Нет активных задач
                            </Typography>
                        ) : (
                            <List>
                                {myTasks.map((task, index) => (
                                    <React.Fragment key={task.assignment_id}>
                                        {index > 0 && <Divider />}
                                        <ListItem
                                            sx={{ cursor: 'pointer' }}
                                            onClick={() => navigate(`/tasks/${task.task_id}`)}
                                        >
                                            <ListItemText
                                                primary={task.task_name}
                                                secondary={task.project_name}
                                            />
                                            <Box sx={{ display: 'flex', gap: 1 }}>
                                                <Chip
                                                    label={task.status_name}
                                                    size="small"
                                                    variant="outlined"
                                                />
                                                <Chip
                                                    label={`P${task.priority}`}
                                                    size="small"
                                                    color={getPriorityColor(task.priority)}
                                                />
                                            </Box>
                                        </ListItem>
                                    </React.Fragment>
                                ))}
                            </List>
                        )}
                        <CardActions>
                            <Button size="small" onClick={() => navigate('/tasks')}>
                                Все задачи
                            </Button>
                        </CardActions>
                    </Paper>
                </Grid>

                {/* Recent Projects */}
                <Grid item xs={12} md={6}>
                    <Paper sx={{ p: 2, height: '100%' }}>
                        <Typography variant="h6" gutterBottom>
                            Активные проекты
                        </Typography>
                        {recentProjects.length === 0 ? (
                            <Typography color="text.secondary">
                                Нет активных проектов
                            </Typography>
                        ) : (
                            <List>
                                {recentProjects.map((project, index) => (
                                    <React.Fragment key={project.project_id}>
                                        {index > 0 && <Divider />}
                                        <ListItem
                                            sx={{ cursor: 'pointer' }}
                                            onClick={() => navigate(`/projects/${project.project_id}`)}
                                        >
                                            <ListItemText
                                                primary={project.name}
                                                secondary={`Задач: ${project.task_count} | Завершено: ${project.completed_tasks}`}
                                            />
                                            <Chip
                                                label={`P${project.priority}`}
                                                size="small"
                                                color={getPriorityColor(project.priority)}
                                            />
                                        </ListItem>
                                    </React.Fragment>
                                ))}
                            </List>
                        )}
                        <CardActions>
                            <Button size="small" onClick={() => navigate('/projects')}>
                                Все проекты
                            </Button>
                        </CardActions>
                    </Paper>
                </Grid>
            </Grid>
        </Box>
    );
};

export default Dashboard;
