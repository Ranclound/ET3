import './globals.css';

export const metadata = {
  title: 'Training Index | KSEA',
  description: 'External training courses for KSEA staff — rate and review what you have taken.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
