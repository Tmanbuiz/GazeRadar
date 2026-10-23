import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'GazeRadar — Stay a step ahead',description:'Your quiet lookout for new job opportunities. Monitor careers pages and find matching changes.'};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="en"><body>{children}</body></html>;}
