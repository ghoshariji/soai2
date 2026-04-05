import * as yup from 'yup';

export const loginSchema = yup.object({
  email: yup
    .string()
    .trim()
    .email('Enter a valid email')
    .required('Email is required'),
  password: yup.string().trim().required('Password is required'),
});

export const forgotPasswordSchema = yup.object({
  email: yup
    .string()
    .trim()
    .email('Enter a valid email')
    .required('Email is required'),
});

const strongPassword = yup
  .string()
  .min(8, 'At least 8 characters')
  .matches(/[A-Z]/, 'Need one uppercase letter')
  .matches(/\d/, 'Need one number')
  .matches(
    /[!@#$%^&*()\-_=+[\]{};':"\\|,.<>/?]/,
    'Need one special character',
  );

export const resetPasswordSchema = yup.object({
  token: yup.string().trim().min(32, 'Paste the full reset token').required('Token is required'),
  newPassword: strongPassword.required('New password is required'),
  confirmNewPassword: yup
    .string()
    .oneOf([yup.ref('newPassword')], 'Passwords must match')
    .required('Confirm your password'),
});
