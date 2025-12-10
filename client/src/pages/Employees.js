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
    Chip,
    CircularProgress,
    InputAdornment,
    FormControlLabel,
    Switch,
    Alert
} from '@mui/material';
import {
    Add as AddIcon,
    Edit as EditIcon,
    Search as SearchIcon,
    PersonOff as DeactivateIcon,
    PersonAdd as ActivateIcon
} from '@mui/icons-material';
import { employeesApi } from '../services/api';
import { useNotification } from '../context/NotificationContext';
import ConfirmDialog from '../components/ConfirmDialog';

const initialFormData = {
    fio: '',
    email: '',
    phone: '',
    role: 'Исполнитель',
    password: ''
};

const Employees = () => {
    const [employees, setEmployees] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [showInactive, setShowInactive] = useState(false);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingEmployee, setEditingEmployee] = useState(null);
    const [formData, setFormData] = useState(initialFormData);
    const [formErrors, setFormErrors] = useState({});
    const [confirmDialog, setConfirmDialog] = useState({ open: false, employee: null, action: '' });
    const { showSuccess, showError } = useNotification();

    useEffect(() => {
        loadEmployees();
    }, [search, showInactive]);

    const loadEmployees = async () => {
        try {
            setLoading(true);
            const params = {};
            if (search) params.search = search;
            if (!showInactive) params.active = true;

            const response = await employeesApi.getAll(params);
            setEmployees(response.data);
        } catch (error) {
            showError('Ошибка загрузки списка сотрудников');
        } finally {
            setLoading(false);
        }
    };

    const validateForm = () => {
        const errors = {};

        if (!formData.fio.trim()) {
            errors.fio = 'ФИО обязательно для заполнения';
        }

        if (!formData.email.trim()) {
            errors.email = 'Email обязателен';
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
            errors.email = 'Введите корректный email';
        }

        if (!formData.phone.trim()) {
            errors.phone = 'Телефон обязателен';
        } else if (!/^\d{11}$/.test(formData.phone)) {
            errors.phone = 'Телефон должен содержать 11 цифр';
        }

        if (!editingEmployee && !formData.password) {
            errors.password = 'Пароль обязателен';
        } else if (!editingEmployee && formData.password.length < 6) {
            errors.password = 'Пароль должен содержать минимум 6 символов';
        }

        setFormErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const handleOpenDialog = (employee = null) => {
        if (employee) {
            setEditingEmployee(employee);
            setFormData({
                fio: employee.fio,
                email: employee.email,
                phone: employee.phone,
                role: employee.role,
                password: ''
            });
        } else {
            setEditingEmployee(null);
            setFormData(initialFormData);
        }
        setFormErrors({});
        setDialogOpen(true);
    };

    const handleCloseDialog = () => {
        setDialogOpen(false);
        setEditingEmployee(null);
        setFormData(initialFormData);
        setFormErrors({});
    };

    const handleSubmit = async () => {
        if (!validateForm()) return;

        try {
            if (editingEmployee) {
                await employeesApi.update(editingEmployee.employee_id, formData);
                showSuccess('Данные сотрудника обновлены');
            } else {
                await employeesApi.create(formData);
                showSuccess('Сотрудник успешно создан');
            }
            handleCloseDialog();
            loadEmployees();
        } catch (error) {
            showError(error.response?.data?.error || 'Ошибка сохранения');
        }
    };

    const handleToggleActive = async () => {
        const { employee, action } = confirmDialog;
        try {
            if (action === 'deactivate') {
                await employeesApi.deactivate(employee.employee_id);
                showSuccess('Сотрудник деактивирован');
            } else {
                await employeesApi.activate(employee.employee_id);
                showSuccess('Сотрудник активирован');
            }
            loadEmployees();
        } catch (error) {
            showError('Ошибка изменения статуса');
        }
        setConfirmDialog({ open: false, employee: null, action: '' });
    };

    return (
        <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="h4">Сотрудники</Typography>
                <Button
                    variant="contained"
                    startIcon={<AddIcon />}
                    onClick={() => handleOpenDialog()}
                >
                    Добавить сотрудника
                </Button>
            </Box>

            <Paper sx={{ p: 2, mb: 2 }}>
                <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                    <TextField
                        placeholder="Поиск по ФИО или email"
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
                                checked={showInactive}
                                onChange={(e) => setShowInactive(e.target.checked)}
                            />
                        }
                        label="Показать неактивных"
                    />
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
                                <TableCell>ФИО</TableCell>
                                <TableCell>Email</TableCell>
                                <TableCell>Телефон</TableCell>
                                <TableCell>Роль</TableCell>
                                <TableCell>Статус</TableCell>
                                <TableCell>Дата найма</TableCell>
                                <TableCell align="right">Действия</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {employees.map((employee) => (
                                <TableRow key={employee.employee_id}>
                                    <TableCell>{employee.fio}</TableCell>
                                    <TableCell>{employee.email}</TableCell>
                                    <TableCell>{employee.phone}</TableCell>
                                    <TableCell>
                                        <Chip
                                            label={employee.role}
                                            size="small"
                                            color={
                                                employee.role === 'Руководитель' ? 'error' :
                                                employee.role === 'PM' ? 'primary' : 'default'
                                            }
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <Chip
                                            label={employee.active ? 'Активен' : 'Неактивен'}
                                            size="small"
                                            color={employee.active ? 'success' : 'default'}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        {new Date(employee.hire_date).toLocaleDateString('ru-RU')}
                                    </TableCell>
                                    <TableCell align="right">
                                        <IconButton
                                            onClick={() => handleOpenDialog(employee)}
                                            title="Редактировать"
                                        >
                                            <EditIcon />
                                        </IconButton>
                                        {employee.active ? (
                                            <IconButton
                                                onClick={() => setConfirmDialog({
                                                    open: true,
                                                    employee,
                                                    action: 'deactivate'
                                                })}
                                                title="Деактивировать"
                                                color="warning"
                                            >
                                                <DeactivateIcon />
                                            </IconButton>
                                        ) : (
                                            <IconButton
                                                onClick={() => setConfirmDialog({
                                                    open: true,
                                                    employee,
                                                    action: 'activate'
                                                })}
                                                title="Активировать"
                                                color="success"
                                            >
                                                <ActivateIcon />
                                            </IconButton>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                            {employees.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={7} align="center">
                                        Сотрудники не найдены
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
                    {editingEmployee ? 'Редактирование сотрудника' : 'Новый сотрудник'}
                </DialogTitle>
                <DialogContent>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
                        <TextField
                            label="ФИО"
                            value={formData.fio}
                            onChange={(e) => setFormData({ ...formData, fio: e.target.value })}
                            error={!!formErrors.fio}
                            helperText={formErrors.fio}
                            required
                            fullWidth
                        />
                        <TextField
                            label="Email"
                            type="email"
                            value={formData.email}
                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                            error={!!formErrors.email}
                            helperText={formErrors.email}
                            required
                            fullWidth
                        />
                        <TextField
                            label="Телефон (11 цифр)"
                            value={formData.phone}
                            onChange={(e) => setFormData({ ...formData, phone: e.target.value.replace(/\D/g, '') })}
                            error={!!formErrors.phone}
                            helperText={formErrors.phone}
                            required
                            fullWidth
                        />
                        <FormControl fullWidth>
                            <InputLabel>Роль</InputLabel>
                            <Select
                                value={formData.role}
                                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                                label="Роль"
                            >
                                <MenuItem value="Руководитель">Руководитель</MenuItem>
                                <MenuItem value="PM">PM</MenuItem>
                                <MenuItem value="Исполнитель">Исполнитель</MenuItem>
                            </Select>
                        </FormControl>
                        {!editingEmployee && (
                            <TextField
                                label="Пароль"
                                type="password"
                                value={formData.password}
                                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                error={!!formErrors.password}
                                helperText={formErrors.password}
                                required
                                fullWidth
                            />
                        )}
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseDialog}>Отмена</Button>
                    <Button onClick={handleSubmit} variant="contained">
                        {editingEmployee ? 'Сохранить' : 'Создать'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Confirm Dialog */}
            <ConfirmDialog
                open={confirmDialog.open}
                title={confirmDialog.action === 'deactivate' ? 'Деактивация сотрудника' : 'Активация сотрудника'}
                message={
                    confirmDialog.action === 'deactivate'
                        ? `Вы уверены, что хотите деактивировать сотрудника ${confirmDialog.employee?.fio}?`
                        : `Вы уверены, что хотите активировать сотрудника ${confirmDialog.employee?.fio}?`
                }
                onConfirm={handleToggleActive}
                onCancel={() => setConfirmDialog({ open: false, employee: null, action: '' })}
            />
        </Box>
    );
};

export default Employees;
