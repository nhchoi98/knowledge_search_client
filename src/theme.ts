import { createTheme } from '@mui/material/styles';

export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#111827',
    },
    secondary: {
      main: '#374151',
    },
    background: {
      default: '#ffffff',
      paper: '#ffffff',
    },
  },
  typography: {
    fontFamily:
      '-apple-system, BlinkMacSystemFont, Segoe UI, Helvetica Neue, Arial, Noto Sans KR, sans-serif',
    h4: {
      fontWeight: 800,
    },
  },
  shape: {
    borderRadius: 10,
  },
});
