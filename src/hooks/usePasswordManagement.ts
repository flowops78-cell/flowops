import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';

export function usePasswordManagement() {
  const { updatePassword: supabaseUpdatePassword } = useAuth();
  const { notify } = useNotification();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  const handleUpdatePassword = async () => {
    if (!newPassword || !confirmPassword) {
      notify({ type: 'error', message: 'All fields are required.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      notify({ type: 'error', message: 'Passwords do not match.' });
      return;
    }
    if (newPassword.length < 8) {
      notify({ type: 'error', message: 'Password must be at least 8 characters.' });
      return;
    }

    setIsUpdatingPassword(true);
    try {
      await supabaseUpdatePassword(newPassword);
      notify({ type: 'success', message: 'Password updated successfully.' });
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      notify({ type: 'error', message: `Update failed: ${err instanceof Error ? err.message : String(err)}` });
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  return {
    newPassword,
    setNewPassword,
    confirmPassword,
    setConfirmPassword,
    isUpdatingPassword,
    handleUpdatePassword,
  };
}
