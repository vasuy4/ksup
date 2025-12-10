import React, { useState, useEffect } from 'react';
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
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    CircularProgress,
    Card,
    CardContent,
    Grid
} from '@mui/material';
import {
    Add as AddIcon,
    Edit as EditIcon,
    Delete as DeleteIcon
} from '@mui/icons-material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { timeEntriesApi, assignmentsApi } from '../services/api';
import { useNotification } from '../context/NotificationContext';
import ConfirmDialog from '../components/ConfirmDialog';

const TimeTracking = () => {
    const [timeEntries, setTimeEntries] = useState([]);
    const [assignments, setAssignments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingEntry, setEditingEntry] = useState(null);
    const [formData, setFormData] = useState({
        assignment_id: '',
        work_date: new Date(),
        hours: 8,
        comment: ''
    });
    const [formErrors, setFormErrors] = useState({});
    const [confirmDialog, setConfirmDialog] = useState({ open: false, entryId: null });
    const [dateFilter, setDateFilter] = useState({
        start_date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        end_date: new Date()
    });
    const { showSuccess, showError } = useNotification();

    useEffect(() => {
        loadData();
    }, [dateFilter]);

    const loadData = async () => {
        try {
            setLoading(true);
            const [entriesRes, assignmentsRes] = await Promise.all([
                timeEntriesApi.getMy({
                    start_date: dateFilter.start_date.toISOString(),
                    end_date: dateFilter.end_date.toISOString()
                }),
                assignmentsApi.getMy()
            ]);

            setTimeEntries(entriesRes.data);
            setAssignments(assignmentsRes.data.filter(a =>
                a.status_name !== 'Завершена' && a.status_name !== 'Отменена'
            ));
        } catch (error) {
            showError('Ошибка загрузки данных');
        } finally {
            setLoading(false);
        }
    };

    const validateForm = () => {
        const errors = {};

        if (!formData.assignment_id) {
            errors.assignment_id = 'Выберите задачу';
        }

        if (formData.hours < 0.5 || formData.hours > 24) {
            errors.hours = 'Часы должны быть от 0.5 до 24';
        }

        if (!formData.comment.trim()) {
            errors.comment = 'Комментарий обязателен';
        }

        // Check date (not more than 7 days ago)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        sevenDaysAgo.setHours(0, 0, 0, 0);

        const workDate = new Date(formData.work_date);
        if (workDate < sevenDaysAgo) {
            errors.work_date = 'Нельзя списать время за дату более 7 дней назад';
        }

        const today = new Date();
        today.setHours(23, 59, 59, 999);
        if (workDate > today) {
            errors.work_date = 'Нельзя списать время на будущую дату';
        }

        setFormErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const handleOpenDialog = (entry = null) => {
        if (entry) {
            setEditingEntry(entry);
            // Find the assignment from entries
            const assignment = assignments.find(a => {
                return timeEntries.find(te =>
                    te.time_entry_id === entry.time_entry_id
                );
            });
            setFormData({
                assignment_id: entry.assignment_id || '',
                work_date: new Date(entry.work_date),
                hours: entry.hours,
                comment: entry.comment
            });
        } else {
            setEditingEntry(null);
            setFormData({
                assignment_id: assignments.length > 0 ? '' : '',
                work_date: new Date(),
                hours: 8,
                comment: ''
            });
        }
        setFormErrors({});
        setDialogOpen(true);
    };

    const handleCloseDialog = () => {
        setDialogOpen(false);
        setEditingEntry(null);
        setFormErrors({});
    };

    const handleSubmit = async () => {
        if (!validateForm()) return;

        try {
            const data = {
                ...formData,
                work_date: formData.work_date.toISOString()
            };

            if (editingEntry) {
                await timeEntriesApi.update(editingEntry.time_entry_id, {
                    hours: data.hours,
                    comment: data.comment
                });
                showSuccess('Запись обновлена');
            } else {
                await timeEntriesApi.create(data);
                showSuccess('Время списано');
            }
            handleCloseDialog();
            loadData();
        } catch (error) {
            showError(error.response?.data?.error || 'Ошибка сохранения');
        }
    };

    const handleDelete = async () => {
        try {
            await timeEntriesApi.delete(confirmDialog.entryId);
            showSuccess('Запись удалена');
            loadData();
        } catch (error) {
            showError('Ошибка удаления');
        }
        setConfirmDialog({ open: false, entryId: null });
    };

    // Calculate totals
    const totalHours = timeEntries.reduce((sum, te) => sum + te.hours, 0);
    const todayEntries = timeEntries.filter(te =>
        new Date(te.work_date).toDateString() === new Date().toDateString()
    );
    const todayHours = todayEntries.reduce((sum, te) => sum + te.hours, 0);

    return (
        <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="h4">Учёт времени</Typography>
                <Button
                    variant="contained"
                    startIcon={<AddIcon />}
                    onClick={() => handleOpenDialog()}
                    disabled={assignments.length === 0}
                >
                    Списать время
                </Button>
            </Box>

            {/* Stats Cards */}
            <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid item xs={12} sm={4}>
                    <Card>
                        <CardContent>
                            <Typography variant="h4">{todayHours}</Typography>
                            <Typography variant="body2" color="text.secondary">Часов сегодня</Typography>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={12} sm={4}>
                    <Card>
                        <CardContent>
                            <Typography variant="h4">{totalHours}</Typography>
                            <Typography variant="body2" color="text.secondary">Часов за период</Typography>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={12} sm={4}>
                    <Card>
                        <CardContent>
                            <Typography variant="h4">{assignments.length}</Typography>
                            <Typography variant="body2" color="text.secondary">Активных задач</Typography>
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>

            {/* Filters */}
            <Paper sx={{ p: 2, mb: 2 }}>
                <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                    <DatePicker
                        label="Начало периода"
                        value={dateFilter.start_date}
                        onChange={(date) => setDateFilter({ ...dateFilter, start_date: date })}
                        slotProps={{ textField: { size: 'small' } }}
                    />
                    <DatePicker
                        label="Конец периода"
                        value={dateFilter.end_date}
                        onChange={(date) => setDateFilter({ ...dateFilter, end_date: date })}
                        slotProps={{ textField: { size: 'small' } }}
                    />
                    <Button
                        variant="outlined"
                        onClick={() => setDateFilter({
                            start_date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
                            end_date: new Date()
                        })}
                    >
                        За неделю
                    </Button>
                    <Button
                        variant="outlined"
                        onClick={() => setDateFilter({
                            start_date: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
                            end_date: new Date()
                        })}
                    >
                        За месяц
                    </Button>
                </Box>
            </Paper>

            {assignments.length === 0 && (
                <Paper sx={{ p: 3, mb: 2, textAlign: 'center' }}>
                    <Typography color="text.secondary">
                        У вас нет активных назначений на задачи. Обратитесь к руководителю проекта.
                    </Typography>
                </Paper>
            )}

            <TableContainer component={Paper}>
                {loading ? (
                    <Box display="flex" justifyContent="center" p={4}>
                        <CircularProgress />
                    </Box>
                ) : (
                    <Table>
                        <TableHead>
                            <TableRow>
                                <TableCell>Дата</TableCell>
                                <TableCell>Проект</TableCell>
                                <TableCell>Задача</TableCell>
                                <TableCell>Часы</TableCell>
                                <TableCell>Комментарий</TableCell>
                                <TableCell align="right">Действия</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {timeEntries.map((entry) => (
                                <TableRow key={entry.time_entry_id}>
                                    <TableCell>
                                        {new Date(entry.work_date).toLocaleDateString('ru-RU')}
                                    </TableCell>
                                    <TableCell>{entry.project_name}</TableCell>
                                    <TableCell>{entry.task_name}</TableCell>
                                    <TableCell>{entry.hours}</TableCell>
                                    <TableCell sx={{ maxWidth: 300 }}>{entry.comment}</TableCell>
                                    <TableCell align="right">
                                        <IconButton
                                            onClick={() => handleOpenDialog(entry)}
                                            title="Редактировать"
                                        >
                                            <EditIcon />
                                        </IconButton>
                                        <IconButton
                                            color="error"
                                            onClick={() => setConfirmDialog({
                                                open: true,
                                                entryId: entry.time_entry_id
                                            })}
                                            title="Удалить"
                                        >
                                            <DeleteIcon />
                                        </IconButton>
                                    </TableCell>
                                </TableRow>
                            ))}
                            {timeEntries.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={6} align="center">
                                        Нет записей за выбранный период
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                )}
            </TableContainer>

            {/* Add/Edit Dialog */}
            <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
                <DialogTitle>
                    {editingEntry ? 'Редактирование записи' : 'Списание времени'}
                </DialogTitle>
                <DialogContent>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
                        {!editingEntry && (
                            <FormControl fullWidth error={!!formErrors.assignment_id}>
                                <InputLabel>Задача</InputLabel>
                                <Select
                                    value={formData.assignment_id}
                                    onChange={(e) => setFormData({ ...formData, assignment_id: e.target.value })}
                                    label="Задача"
                                >
                                    {assignments.map(assignment => (
                                        <MenuItem key={assignment.assignment_id} value={assignment.assignment_id}>
                                            {assignment.project_name} — {assignment.task_name}
                                        </MenuItem>
                                    ))}
                                </Select>
                                {formErrors.assignment_id && (
                                    <Typography variant="caption" color="error">{formErrors.assignment_id}</Typography>
                                )}
                            </FormControl>
                        )}
                        {!editingEntry && (
                            <DatePicker
                                label="Дата"
                                value={formData.work_date}
                                onChange={(date) => setFormData({ ...formData, work_date: date })}
                                slotProps={{
                                    textField: {
                                        fullWidth: true,
                                        error: !!formErrors.work_date,
                                        helperText: formErrors.work_date
                                    }
                                }}
                            />
                        )}
                        <TextField
                            label="Часы (0.5 - 24)"
                            type="number"
                            value={formData.hours}
                            onChange={(e) => setFormData({ ...formData, hours: parseFloat(e.target.value) || 0 })}
                            error={!!formErrors.hours}
                            helperText={formErrors.hours}
                            inputProps={{ min: 0.5, max: 24, step: 0.5 }}
                            fullWidth
                        />
                        <TextField
                            label="Комментарий"
                            value={formData.comment}
                            onChange={(e) => setFormData({ ...formData, comment: e.target.value })}
                            error={!!formErrors.comment}
                            helperText={formErrors.comment}
                            multiline
                            rows={3}
                            required
                            fullWidth
                        />
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseDialog}>Отмена</Button>
                    <Button onClick={handleSubmit} variant="contained">
                        {editingEntry ? 'Сохранить' : 'Списать'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Confirm Dialog */}
            <ConfirmDialog
                open={confirmDialog.open}
                title="Удаление записи"
                message="Вы уверены, что хотите удалить эту запись о трудозатратах?"
                confirmColor="error"
                onConfirm={handleDelete}
                onCancel={() => setConfirmDialog({ open: false, entryId: null })}
            />
        </Box>
    );
};

export default TimeTracking;
