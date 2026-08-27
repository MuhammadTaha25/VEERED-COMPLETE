export const metadata = {
  title: 'Veer — AI Recruitment Platform',
  description: 'Explainable, auditable AI matching for UK & Ireland recruitment',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
