export const loginCopy = {
  title: 'Login',
  studentDescription: 'The account will be automatically created for the first login.',
  staffDescription: 'Sign in with the account provided by the administrator.',

  emailLabel: 'Email Address',
  passcodeLabel: 'Passcode',
  passwordLabel: 'Password',

  emailPlaceholder: 'Enter your email',
  passcodePlaceholder: 'Enter 6-digit code',
  passwordPlaceholder: 'Enter your password',

  sendCode: 'Send Verification Code',
  resendIn: (seconds: number): string => `Resend in ${seconds}s`,

  previous: 'Previous',
  next: 'Next',

  staffEntry: 'Admin / Supervisor login',
  studentEntry: 'Student login',

  otpSent: 'Verification code sent. Please check your inbox.',
  otpValidFor: (minutes: number): string =>
    `It is valid for ${minutes} minute${minutes === 1 ? '' : 's'}.`,

  emailRequired: 'Please enter your email address.',
  emailInvalid: 'Please enter a valid email address.',
  passcodeRequired: 'Please enter the verification code.',
  passcodeInvalid: 'The verification code must be 6 digits.',
  passwordRequired: 'Please enter your password.',

  studentInvalidCredentials: 'The email address or verification code is incorrect.',
  staffInvalidCredentials: 'The email address or password is incorrect.',
} as const;
