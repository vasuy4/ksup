import React from 'react';
import {
    Box,
    Paper,
    Typography,
    Card,
    CardContent,
    CardActions,
    Chip,
    IconButton,
    Button
} from '@mui/material';
import {
    Edit as EditIcon,
    Visibility as ViewIcon
} from '@mui/icons-material';

const statusColors = {
    'Создана': '#e3f2fd',
    'В работе': '#fff3e0',
    'На проверке': '#fff8e1',
    'Завершена': '#e8f5e9',
    'Отменена': '#fce4ec'
};

const KanbanBoard = ({ kanban, statuses, onStatusChange, onTaskClick, onEditTask }) => {
    const getPriorityColor = (priority) => {
        if (priority >= 4) return 'error';
        if (priority >= 3) return 'warning';
        return 'success';
    };

    const handleDrop = (e, statusName) => {
        e.preventDefault();
        const taskId = e.dataTransfer.getData('taskId');
        const status = statuses.find(s => s.name === statusName);
        if (status && taskId) {
            onStatusChange(parseInt(taskId), status.status_id);
        }
    };

    const handleDragOver = (e) => {
        e.preventDefault();
    };

    const handleDragStart = (e, task) => {
        e.dataTransfer.setData('taskId', task.task_id.toString());
    };

    return (
        <Box
            sx={{
                display: 'flex',
                gap: 2,
                overflowX: 'auto',
                pb: 2
            }}
        >
            {statuses.map((status) => (
                <Paper
                    key={status.status_id}
                    sx={{
                        minWidth: 280,
                        maxWidth: 320,
                        backgroundColor: statusColors[status.name] || '#f5f5f5',
                        p: 1
                    }}
                    onDrop={(e) => handleDrop(e, status.name)}
                    onDragOver={handleDragOver}
                >
                    <Box sx={{ p: 1, mb: 1 }}>
                        <Typography variant="subtitle1" fontWeight="bold">
                            {status.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                            {kanban[status.name]?.length || 0} задач
                        </Typography>
                    </Box>

                    <Box sx={{ minHeight: 200 }}>
                        {kanban[status.name]?.map((task) => (
                            <Card
                                key={task.task_id}
                                sx={{
                                    mb: 1,
                                    cursor: 'grab',
                                    '&:hover': {
                                        boxShadow: 3
                                    }
                                }}
                                draggable
                                onDragStart={(e) => handleDragStart(e, task)}
                            >
                                <CardContent sx={{ pb: 1 }}>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                                        <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>
                                            {task.name}
                                        </Typography>
                                        <Chip
                                            label={`P${task.priority}`}
                                            size="small"
                                            color={getPriorityColor(task.priority)}
                                            sx={{ ml: 1 }}
                                        />
                                    </Box>

                                    {task.assignees && (
                                        <Typography variant="caption" color="text.secondary" display="block">
                                            {task.assignees}
                                        </Typography>
                                    )}

                                    <Box sx={{ mt: 1, display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                                        <Chip
                                            label={`${task.hours_spent || 0} / ${task.effort_plan} ч.`}
                                            size="small"
                                            variant="outlined"
                                        />
                                        <Chip
                                            label={new Date(task.end_plan).toLocaleDateString('ru-RU')}
                                            size="small"
                                            variant="outlined"
                                            color={new Date(task.end_plan) < new Date() && status.name !== 'Завершена' ? 'error' : 'default'}
                                        />
                                    </Box>
                                </CardContent>
                                <CardActions sx={{ pt: 0 }}>
                                    <IconButton
                                        size="small"
                                        onClick={() => onTaskClick(task)}
                                        title="Просмотр"
                                    >
                                        <ViewIcon fontSize="small" />
                                    </IconButton>
                                    {onEditTask && (
                                        <IconButton
                                            size="small"
                                            onClick={() => onEditTask(task)}
                                            title="Редактировать"
                                        >
                                            <EditIcon fontSize="small" />
                                        </IconButton>
                                    )}
                                </CardActions>
                            </Card>
                        ))}
                    </Box>
                </Paper>
            ))}
        </Box>
    );
};

export default KanbanBoard;
