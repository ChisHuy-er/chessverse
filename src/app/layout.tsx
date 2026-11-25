import type { Metadata } from "next";
import { Noto_Serif, Playfair_Display } from "next/font/google";
import "./globals.css";
import "./academy-theme.css";
import { ThemeProvider } from "./components/ThemeProvider";

// Font chữ có chân dùng cho tiêu đề lớn (hỗ trợ tiếng Việt).
const displayFont = Playfair_Display({
  subsets: ["latin", "vietnamese"],
  style: ["normal", "italic"],
  weight: ["600", "700", "800"],
  variable: "--font-display",
  display: "swap",
});

// Font số và nút (giá tiền, kim cương, xu, nút Mua) – kiểu chữ có chân đậm như ảnh mẫu.
const numberFont = Noto_Serif({
  subsets: ["latin", "vietnamese"],
  weight: ["600", "700"],
  variable: "--font-num",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ChessVerse - The Next Move",
  description:
    "ChessVerse - Nền tảng cờ vua trực tuyến. Học tập, thi đấu, leo rank và chinh phục những thử thách.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="vi"
      suppressHydrationWarning
      className={`${displayFont.variable} ${numberFont.variable}`}
    >
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
