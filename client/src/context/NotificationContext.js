import React, { createContext, useState, useContext } from 'react';
import { Snackbar, Alert } from '@mui/material';

const NotificationContext = createContext(null);

export const useNotification = () => {
    const context = useContext(NotificationContext);
    if (!context) {
        throw new Error('useNotification must be used within a NotificationProvider');
    }
    return context;
};

export const NotificationProvider = ({ children }) => {
    const [notification, setNotification] = useState({
        open: false,
        message: '',
        severity: 'info'
    });

    const showSuccess = (message) => {
        setNotification({ open: true, message, severity: 'success' });
    };

    const showError = (message) => {
        setNotification({ open: true, message, severity: 'error' });
    };

    const showWarning = (message) => {
        setNotification({ open: true, message, severity: 'warning' });
    };

    const showInfo = (message) => {
        setNotification({ open: true, message, severity: 'info' });
    };

    const handleClose = () => {
        setNotification(prev => ({ ...prev, open: false }));
    };

    return (
        <NotificationContext.Provider value={{ showSuccess, showError, showWarning, showInfo }}>
            {children}
            <Snackbar
                open={notification.open}
                autoHideDuration={4000}
                onClose={handleClose}
                anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
            >
                <Alert
                    onClose={handleClose}
                    severity={notification.severity}
                    variant="filled"
                    sx={{ width: '100%' }}
                >
                    {notification.message}
                </Alert>
            </Snackbar>
        </NotificationContext.Provider>
    );
};
