import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import '@fontsource/noto-sans/latin-400.css';
import '@fontsource/noto-sans/latin-600.css';
import '@fontsource/noto-sans/latin-700.css';
import '@fontsource/noto-sans-devanagari/devanagari-400.css';
import '@fontsource/noto-sans-devanagari/devanagari-600.css';
import '@fontsource/noto-sans-devanagari/devanagari-700.css';
import '@fontsource/noto-sans-telugu/telugu-400.css';
import '@fontsource/noto-sans-telugu/telugu-600.css';
import '@fontsource/noto-sans-telugu/telugu-700.css';
import '@fontsource/noto-sans-tamil/tamil-400.css';
import '@fontsource/noto-sans-tamil/tamil-600.css';
import '@fontsource/noto-sans-tamil/tamil-700.css';
import './index.css';

createRoot(document.getElementById('root')!).render(<App />);
