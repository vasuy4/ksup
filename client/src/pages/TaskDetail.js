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
    List,
    ListItem,
    ListItemText,
    ListItemSecondaryAction,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow
} from '@mui/material';
import {
    ArrowBack as BackIcon,
    Add as AddIcon,
    Delete as DeleteIcon
} from '@mui/icons-material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { tasksApi, statusesApi, assignmentsApi, employeesApi, timeEntriesApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import ConfirmDialog from '../components/ConfirmDialog';

const TaskDetail = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user, isManager } = useAuth();
    const { showSuccess, showError } = useNotification();

    const [task, setTask] = useState(null);
    const [statuses, setStatuses] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [timeEntries, setTimeEntries] = useState([]);
    const [loading, setLoading] = useState(true);

    const [assignDialogOpen, setAssignDialogOpen] = useState(false);
    const [assignFormData, setAssignFormData] = useState({
        employee_id: '',
        role_on_task: 'Исполнитель',
        allocation_pct: 100,
        hourly_rate: 1500,
        date_from: new Date(),
        date_to: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    });

    const [confirmDialog, setConfirmDialog] = useState({ open: false, assignmentId: null });

    useEffect(() => {
        loadData();
    }, [id]);

    const loadData = async () => {
        try {
            setLoading(true);
            const [taskRes, statusesRes] = await Promise.all([
                tasksApi.getById(id),
                statusesApi.getAll()
            ]);

            setTask(taskRes.data);
            setStatuses(statusesRes.data);

            // Load time entries
            const timeRes = await timeEntriesApi.getByTask(id);
            setTimeEntries(timeRes.data);

            // Load employees for managers
            if (isManager()) {
                const empRes = await employeesApi.getAll({ active: true });
                setEmployees(empRes.data);
            }
        } catch (error) {
            showError('Ошибка загрузки данных');
        } finally {
            setLoading(false);
        }
    };

    const handleStatusChange = async (newStatusId) => {
        try {
            await tasksApi.updateStatus(id, newStatusId);
            showSuccess('Статус изменён');
            loadData();
        } catch (error) {
            showError(error.response?.data?.error || 'Ошибка изменения статуса');
        }
    };

    const handleAssign = async () => {
        try {
            await assignmentsApi.create({
                ...assignFormData,
                task_id: parseInt(id),
                date_from: assignFormData.date_from.toISOString(),
                date_to: assignFormData.date_to.toISOString()
            });
            showSuccess('Исполнитель назначен');
            setAssignDialogOpen(false);
            loadData();
        } catch (error) {
            showError(error.response?.data?.error || 'Ошибка назначения');
        }
    };

    const handleRemoveAssignment = async () => {
        try {
            await assignmentsApi.delete(confirmDialog.assignmentId);
            showSuccess('Назначение удалено');
            loadData();
        } catch (error) {
            showError('Ошибка удаления');
        }
        setConfirmDialog({ open: false, assignmentId: null });
    };

    const canChangeStatus = () => {
        if (isManager()) return true;
        return task?.assignments?.some(a => a.employee_id === user.employee_id);
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

    if (loading) {
        return (
            <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
                <CircularProgress />
            </Box>
        );
    }

    if (!task) {
        return (
            <Box>
                <Typography>Задача не найдена</Typography>
                <Button onClick={() => navigate(-1)}>Назад</Button>
            </Box>
        );
    }

    return (
        <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
                <IconButton onClick={() => navigate(-1)} sx={{ mr: 2 }}>
                    <BackIcon />
                </IconButton>
                <Box sx={{ flexGrow: 1 }}>
                    <Typography variant="h4">{task.name}</Typography>
                    <Typography variant="body2" color="text.secondary">
                        Проект: {task.project_name}
                    </Typography>
                </Box>
                <Chip
                    label={`P${task.priority}`}
                    color={getPriorityColor(task.priority)}
                    sx={{ mr: 1 }}
                />
                <Chip
                    label={task.status_name}
                    color={getStatusColor(task.status_name)}
                />
            </Box>

            <Grid container spacing={3}>
                <Grid item xs={12} md={8}>
                    <Paper sx={{ p: 3, mb: 3 }}>
                        <Typography variant="h6" gutterBottom>Описание</Typography>
                        <Typography>{task.description || 'Без описания'}</Typography>
                    </Paper>

                    {/* Assignments */}
                    <Paper sx={{ p: 3, mb: 3 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                            <Typography variant="h6">Исполнители</Typography>
                            {isManager() && (
                                <Button
                                    startIcon={<AddIcon />}
                                    onClick={() => setAssignDialogOpen(true)}
                                >
                                    Назначить
                                </Button>
                            )}
                        </Box>

                        {task.assignments?.length > 0 ? (
                            <List>
                                {task.assignments.map((assignment) => (
                                    <ListItem key={assignment.assignment_id} divider>
                                        <ListItemText
                                            primary={assignment.fio}
                                            secondary={`${assignment.role_on_task} | ${assignment.allocation_pct}% | ${assignment.hourly_rate} руб./ч.`}
                                        />
                                        {isManager() && (
                                            <ListItemSecondaryAction>
                                                <IconButton
                                                    edge="end"
                                                    color="error"
                                                    onClick={() => setConfirmDialog({
                                                        open: true,
                                                        assignmentId: assignment.assignment_id
                                                    })}
                                                >
                                                    <DeleteIcon />
                                                </IconButton>
                                            </ListItemSecondaryAction>
                                        )}
                                    </ListItem>
                                ))}
                            </List>
                        ) : (
                            <Typography color="text.secondary">Исполнители не назначены</Typography>
                        )}
                    </Paper>

                    {/* Time Entries */}
                    <Paper sx={{ p: 3 }}>
                        <Typography variant="h6" gutterBottom>История трудозатрат</Typography>
                        {timeEntries.length > 0 ? (
                            <TableContainer>
                                <Table size="small">
                                    <TableHead>
                                        <TableRow>
                                            <TableCell>Дата</TableCell>
                                            <TableCell>Сотрудник</TableCell>
                                            <TableCell>Часы</TableCell>
                                            <TableCell>Комментарий</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {timeEntries.map((entry) => (
                                            <TableRow key={entry.time_entry_id}>
                                                <TableCell>
                                                    {new Date(entry.work_date).toLocaleDateString('ru-RU')}
                                                </TableCell>
                                                <TableCell>{entry.employee_name}</TableCell>
                                                <TableCell>{entry.hours}</TableCell>
                                                <TableCell>{entry.comment}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        ) : (
                            <Typography color="text.secondary">Нет записей о трудозатратах</Typography>
                        )}
                    </Paper>
                </Grid>

                <Grid item xs={12} md={4}>
                    {/* Status Change */}
                    {canChangeStatus() && (
                        <Paper sx={{ p: 3, mb: 3 }}>
                            <Typography variant="h6" gutterBottom>Изменить статус</Typography>
                            <FormControl fullWidth>
                                <InputLabel>Статус</InputLabel>
                                <Select
                                    value={task.status_id}
                                    onChange={(e) => handleStatusChange(e.target.value)}
                                    label="Статус"
                                >
                                    {statuses.map(status => (
                                        <MenuItem key={status.status_id} value={status.status_id}>
                                            {status.name}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        </Paper>
                    )}

                    {/* Dates */}
                    <Paper sx={{ p: 3, mb: 3 }}>
                        <Typography variant="h6" gutterBottom>Сроки</Typography>
                        <Typography variant="body2" color="text.secondary">План. начало</Typography>
                        <Typography gutterBottom>{new Date(task.start_plan).toLocaleDateString('ru-RU')}</Typography>
                        <Typography variant="body2" color="text.secondary">План. окончание</Typography>
                        <Typography gutterBottom>{new Date(task.end_plan).toLocaleDateString('ru-RU')}</Typography>
                        {task.start_actual && (
                            <>
                                <Divider sx={{ my: 1 }} />
                                <Typography variant="body2" color="text.secondary">Факт. начало</Typography>
                                <Typography gutterBottom>{new Date(task.start_actual).toLocaleDateString('ru-RU')}</Typography>
                            </>
                        )}
                        {task.end_actual && (
                            <>
                                <Typography variant="body2" color="text.secondary">Факт. окончание</Typography>
                                <Typography>{new Date(task.end_actual).toLocaleDateString('ru-RU')}</Typography>
                            </>
                        )}
                    </Paper>

                    {/* Effort */}
                    <Paper sx={{ p: 3 }}>
                        <Typography variant="h6" gutterBottom>Трудозатраты</Typography>
                        <Typography variant="body2" color="text.secondary">Плановые</Typography>
                        <Typography gutterBottom>{task.effort_plan} ч.</Typography>
                        <Typography variant="body2" color="text.secondary">Фактические</Typography>
                        <Typography gutterBottom>{task.hours_spent || 0} ч.</Typography>
                        <Divider sx={{ my: 1 }} />
                        <Typography variant="body2" color="text.secondary">Осталось</Typography>
                        <Typography color={(task.effort_plan - (task.hours_spent || 0)) >= 0 ? 'success.main' : 'error.main'}>
                            {task.effort_plan - (task.hours_spent || 0)} ч.
                        </Typography>
                    </Paper>
                </Grid>
            </Grid>

            {/* Assignment Dialog */}
            <Dialog open={assignDialogOpen} onClose={() => setAssignDialogOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Назначить исполнителя</DialogTitle>
                <DialogContent>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
                        <FormControl fullWidth>
                            <InputLabel>Сотрудник</InputLabel>
                            <Select
                                value={assignFormData.employee_id}
                                onChange={(e) => setAssignFormData({ ...assignFormData, employee_id: e.target.value })}
                                label="Сотрудник"
                            >
                                {employees
                                    .filter(e => !task.assignments?.some(a => a.employee_id === e.employee_id))
                                    .map(emp => (
                                        <MenuItem key={emp.employee_id} value={emp.employee_id}>
                                            {emp.fio} ({emp.role})
                                        </MenuItem>
                                    ))
                                }
                            </Select>
                        </FormControl>
                        <TextField
                            label="Роль на задаче"
                            value={assignFormData.role_on_task}
                            onChange={(e) => setAssignFormData({ ...assignFormData, role_on_task: e.target.value })}
                            fullWidth
                        />
                        <TextField
                            label="Загрузка (%)"
                            type="number"
                            value={assignFormData.allocation_pct}
                            onChange={(e) => setAssignFormData({ ...assignFormData, allocation_pct: parseInt(e.target.value) || 0 })}
                            fullWidth
                        />
                        <TextField
                            label="Ставка (руб./ч.)"
                            type="number"
                            value={assignFormData.hourly_rate}
                            onChange={(e) => setAssignFormData({ ...assignFormData, hourly_rate: parseFloat(e.target.value) || 0 })}
                            fullWidth
                        />
                        <DatePicker
                            label="Дата начала"
                            value={assignFormData.date_from}
                            onChange={(date) => setAssignFormData({ ...assignFormData, date_from: date })}
                            slotProps={{ textField: { fullWidth: true } }}
                        />
                        <DatePicker
                            label="Дата окончания"
                            value={assignFormData.date_to}
                            onChange={(date) => setAssignFormData({ ...assignFormData, date_to: date })}
                            slotProps={{ textField: { fullWidth: true } }}
                        />
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setAssignDialogOpen(false)}>Отмена</Button>
                    <Button onClick={handleAssign} variant="contained" disabled={!assignFormData.employee_id}>
                        Назначить
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Confirm Dialog */}
            <ConfirmDialog
                open={confirmDialog.open}
                title="Удаление назначения"
                message="Вы уверены, что хотите удалить это назначение?"
                confirmColor="error"
                onConfirm={handleRemoveAssignment}
                onCancel={() => setConfirmDialog({ open: false, assignmentId: null })}
            />
        </Box>
    );
};

export default TaskDetail;
