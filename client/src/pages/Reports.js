import React, { useState, useEffect } from 'react';
import {
    Box,
    Paper,
    Typography,
    Grid,
    Card,
    CardContent,
    Button,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    CircularProgress,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Tabs,
    Tab,
    Divider
} from '@mui/material';
import {
    Download as DownloadIcon,
    PictureAsPdf as PdfIcon,
    TableChart as ExcelIcon
} from '@mui/icons-material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { projectsApi, reportsApi } from '../services/api';
import { useNotification } from '../context/NotificationContext';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

const Reports = () => {
    const [tabValue, setTabValue] = useState(0);
    const [projects, setProjects] = useState([]);
    const [selectedProject, setSelectedProject] = useState('');
    const [projectReport, setProjectReport] = useState(null);
    const [workloadReport, setWorkloadReport] = useState([]);
    const [loading, setLoading] = useState(false);
    const [dateFilter, setDateFilter] = useState({
        start_date: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
        end_date: new Date()
    });
    const { showSuccess, showError } = useNotification();

    useEffect(() => {
        loadProjects();
    }, []);

    useEffect(() => {
        if (tabValue === 1) {
            loadWorkloadReport();
        }
    }, [tabValue, dateFilter]);

    const loadProjects = async () => {
        try {
            const response = await projectsApi.getAll();
            setProjects(response.data);
        } catch (error) {
            showError('Ошибка загрузки проектов');
        }
    };

    const loadProjectReport = async (projectId) => {
        try {
            setLoading(true);
            const response = await reportsApi.getProjectReport(projectId);
            setProjectReport(response.data);
        } catch (error) {
            showError('Ошибка загрузки отчёта');
        } finally {
            setLoading(false);
        }
    };

    const loadWorkloadReport = async () => {
        try {
            setLoading(true);
            const response = await reportsApi.getWorkloadReport({
                start_date: dateFilter.start_date.toISOString(),
                end_date: dateFilter.end_date.toISOString()
            });
            setWorkloadReport(response.data);
        } catch (error) {
            showError('Ошибка загрузки отчёта');
        } finally {
            setLoading(false);
        }
    };

    const handleProjectChange = (projectId) => {
        setSelectedProject(projectId);
        if (projectId) {
            loadProjectReport(projectId);
        } else {
            setProjectReport(null);
        }
    };

    const handleExportProjectPdf = async () => {
        if (!selectedProject) return;
        try {
            const response = await reportsApi.exportProjectPdf(selectedProject);
            const blob = new Blob([response.data], { type: 'application/pdf' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `project_${selectedProject}_report.pdf`;
            a.click();
            window.URL.revokeObjectURL(url);
            showSuccess('Отчёт экспортирован в PDF');
        } catch (error) {
            showError('Ошибка экспорта');
        }
    };

    const handleExportProjectExcel = async () => {
        if (!selectedProject) return;
        try {
            const response = await reportsApi.exportProjectExcel(selectedProject);
            const blob = new Blob([response.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `project_${selectedProject}_report.xlsx`;
            a.click();
            window.URL.revokeObjectURL(url);
            showSuccess('Отчёт экспортирован в Excel');
        } catch (error) {
            showError('Ошибка экспорта');
        }
    };

    const handleExportWorkloadExcel = async () => {
        try {
            const response = await reportsApi.exportWorkloadExcel({
                start_date: dateFilter.start_date.toISOString(),
                end_date: dateFilter.end_date.toISOString()
            });
            const blob = new Blob([response.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `workload_report.xlsx`;
            a.click();
            window.URL.revokeObjectURL(url);
            showSuccess('Отчёт экспортирован в Excel');
        } catch (error) {
            showError('Ошибка экспорта');
        }
    };

    // Prepare chart data for project report
    const getTasksChartData = () => {
        if (!projectReport?.taskStats) return [];
        const stats = projectReport.taskStats;
        return [
            { name: 'Создано', value: stats.new_tasks || 0 },
            { name: 'В работе', value: stats.in_progress_tasks || 0 },
            { name: 'На проверке', value: stats.review_tasks || 0 },
            { name: 'Завершено', value: stats.completed_tasks || 0 },
            { name: 'Отменено', value: stats.cancelled_tasks || 0 }
        ].filter(d => d.value > 0);
    };

    const getEffortChartData = () => {
        if (!projectReport) return [];
        return [
            { name: 'Плановые', hours: projectReport.taskStats?.effort_plan_total || 0 },
            { name: 'Фактические', hours: projectReport.effortFact || 0 }
        ];
    };

    return (
        <Box>
            <Typography variant="h4" gutterBottom>Отчёты</Typography>

            <Tabs value={tabValue} onChange={(e, v) => setTabValue(v)} sx={{ mb: 3 }}>
                <Tab label="По проекту" />
                <Tab label="По загрузке сотрудников" />
            </Tabs>

            {/* Project Report Tab */}
            {tabValue === 0 && (
                <Box>
                    <Paper sx={{ p: 2, mb: 3 }}>
                        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                            <FormControl sx={{ minWidth: 300 }}>
                                <InputLabel>Выберите проект</InputLabel>
                                <Select
                                    value={selectedProject}
                                    onChange={(e) => handleProjectChange(e.target.value)}
                                    label="Выберите проект"
                                >
                                    <MenuItem value="">Не выбран</MenuItem>
                                    {projects.map(project => (
                                        <MenuItem key={project.project_id} value={project.project_id}>
                                            {project.name}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                            {selectedProject && (
                                <>
                                    <Button
                                        startIcon={<PdfIcon />}
                                        onClick={handleExportProjectPdf}
                                    >
                                        Экспорт PDF
                                    </Button>
                                    <Button
                                        startIcon={<ExcelIcon />}
                                        onClick={handleExportProjectExcel}
                                    >
                                        Экспорт Excel
                                    </Button>
                                </>
                            )}
                        </Box>
                    </Paper>

                    {loading && (
                        <Box display="flex" justifyContent="center" p={4}>
                            <CircularProgress />
                        </Box>
                    )}

                    {projectReport && !loading && (
                        <Grid container spacing={3}>
                            {/* Project Info */}
                            <Grid item xs={12} md={6}>
                                <Paper sx={{ p: 3 }}>
                                    <Typography variant="h6" gutterBottom>
                                        {projectReport.project.name}
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary" paragraph>
                                        {projectReport.project.description || 'Без описания'}
                                    </Typography>

                                    <Divider sx={{ my: 2 }} />

                                    <Grid container spacing={2}>
                                        <Grid item xs={6}>
                                            <Typography variant="body2" color="text.secondary">Плановый бюджет</Typography>
                                            <Typography variant="h6">{projectReport.project.budget_plan?.toLocaleString('ru-RU')} руб.</Typography>
                                        </Grid>
                                        <Grid item xs={6}>
                                            <Typography variant="body2" color="text.secondary">Фактический бюджет</Typography>
                                            <Typography variant="h6">{projectReport.project.budget_fact?.toLocaleString('ru-RU')} руб.</Typography>
                                        </Grid>
                                        <Grid item xs={6}>
                                            <Typography variant="body2" color="text.secondary">План. начало</Typography>
                                            <Typography>{new Date(projectReport.project.start_plan).toLocaleDateString('ru-RU')}</Typography>
                                        </Grid>
                                        <Grid item xs={6}>
                                            <Typography variant="body2" color="text.secondary">План. окончание</Typography>
                                            <Typography>{new Date(projectReport.project.end_plan).toLocaleDateString('ru-RU')}</Typography>
                                        </Grid>
                                    </Grid>
                                </Paper>
                            </Grid>

                            {/* Tasks Chart */}
                            <Grid item xs={12} md={6}>
                                <Paper sx={{ p: 3 }}>
                                    <Typography variant="h6" gutterBottom>Распределение задач по статусам</Typography>
                                    <ResponsiveContainer width="100%" height={250}>
                                        <PieChart>
                                            <Pie
                                                data={getTasksChartData()}
                                                cx="50%"
                                                cy="50%"
                                                labelLine={false}
                                                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                                                outerRadius={80}
                                                fill="#8884d8"
                                                dataKey="value"
                                            >
                                                {getTasksChartData().map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                                ))}
                                            </Pie>
                                            <Tooltip />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </Paper>
                            </Grid>

                            {/* Effort Chart */}
                            <Grid item xs={12} md={6}>
                                <Paper sx={{ p: 3 }}>
                                    <Typography variant="h6" gutterBottom>Трудозатраты (часы)</Typography>
                                    <ResponsiveContainer width="100%" height={250}>
                                        <BarChart data={getEffortChartData()}>
                                            <CartesianGrid strokeDasharray="3 3" />
                                            <XAxis dataKey="name" />
                                            <YAxis />
                                            <Tooltip />
                                            <Bar dataKey="hours" fill="#8884d8" />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </Paper>
                            </Grid>

                            {/* Team */}
                            <Grid item xs={12} md={6}>
                                <Paper sx={{ p: 3 }}>
                                    <Typography variant="h6" gutterBottom>Команда проекта</Typography>
                                    <TableContainer>
                                        <Table size="small">
                                            <TableHead>
                                                <TableRow>
                                                    <TableCell>Сотрудник</TableCell>
                                                    <TableCell>Email</TableCell>
                                                    <TableCell align="right">Часов</TableCell>
                                                </TableRow>
                                            </TableHead>
                                            <TableBody>
                                                {projectReport.team?.map((member) => (
                                                    <TableRow key={member.employee_id}>
                                                        <TableCell>{member.fio}</TableCell>
                                                        <TableCell>{member.email}</TableCell>
                                                        <TableCell align="right">{member.hours_spent || 0}</TableCell>
                                                    </TableRow>
                                                ))}
                                                {(!projectReport.team || projectReport.team.length === 0) && (
                                                    <TableRow>
                                                        <TableCell colSpan={3} align="center">
                                                            Нет назначенных сотрудников
                                                        </TableCell>
                                                    </TableRow>
                                                )}
                                            </TableBody>
                                        </Table>
                                    </TableContainer>
                                </Paper>
                            </Grid>
                        </Grid>
                    )}

                    {!selectedProject && !loading && (
                        <Paper sx={{ p: 4, textAlign: 'center' }}>
                            <Typography color="text.secondary">
                                Выберите проект для формирования отчёта
                            </Typography>
                        </Paper>
                    )}
                </Box>
            )}

            {/* Workload Report Tab */}
            {tabValue === 1 && (
                <Box>
                    <Paper sx={{ p: 2, mb: 3 }}>
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
                                startIcon={<ExcelIcon />}
                                onClick={handleExportWorkloadExcel}
                            >
                                Экспорт Excel
                            </Button>
                        </Box>
                    </Paper>

                    {loading && (
                        <Box display="flex" justifyContent="center" p={4}>
                            <CircularProgress />
                        </Box>
                    )}

                    {!loading && (
                        <Grid container spacing={3}>
                            {/* Workload Chart */}
                            <Grid item xs={12}>
                                <Paper sx={{ p: 3 }}>
                                    <Typography variant="h6" gutterBottom>Загрузка сотрудников (часы)</Typography>
                                    <ResponsiveContainer width="100%" height={300}>
                                        <BarChart data={workloadReport}>
                                            <CartesianGrid strokeDasharray="3 3" />
                                            <XAxis dataKey="fio" tick={{ fontSize: 12 }} />
                                            <YAxis />
                                            <Tooltip />
                                            <Legend />
                                            <Bar dataKey="hours_spent" fill="#8884d8" name="Часов" />
                                            <Bar dataKey="total_tasks" fill="#82ca9d" name="Задач" />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </Paper>
                            </Grid>

                            {/* Workload Table */}
                            <Grid item xs={12}>
                                <TableContainer component={Paper}>
                                    <Table>
                                        <TableHead>
                                            <TableRow>
                                                <TableCell>Сотрудник</TableCell>
                                                <TableCell>Email</TableCell>
                                                <TableCell>Роль</TableCell>
                                                <TableCell align="right">Задач</TableCell>
                                                <TableCell align="right">Часов за период</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {workloadReport.map((emp) => (
                                                <TableRow key={emp.employee_id}>
                                                    <TableCell>{emp.fio}</TableCell>
                                                    <TableCell>{emp.email}</TableCell>
                                                    <TableCell>{emp.role}</TableCell>
                                                    <TableCell align="right">{emp.total_tasks}</TableCell>
                                                    <TableCell align="right">{emp.hours_spent || 0}</TableCell>
                                                </TableRow>
                                            ))}
                                            {workloadReport.length === 0 && (
                                                <TableRow>
                                                    <TableCell colSpan={5} align="center">
                                                        Нет данных
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                            </Grid>
                        </Grid>
                    )}
                </Box>
            )}
        </Box>
    );
};

export default Reports;
