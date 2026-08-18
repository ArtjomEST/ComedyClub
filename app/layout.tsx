import type {Metadata} from "next"; import "./globals.css";
export const metadata:Metadata={title:"Comedy Club Battle",description:"Live stand-up battles in your browser."};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
