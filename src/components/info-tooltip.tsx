"use client";

import {
  useEffect,
  useRef,
  useState,
  useId,
  useCallback,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";

export interface InfoTooltipProps {
  content: React.ReactNode;
  title?: string;
  label?: string;
  variant?: "info" | "warning" | "help";
  align?: "left" | "center" | "right";
  side?: "top" | "bottom";
  className?: string;
}

// Hook resmi React 19 untuk mendeteksi client-side hydration tanpa efek setState
const emptySubscribe = () => () => {};
function useIsClient() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
}

export function InfoTooltip({
  content,
  title,
  label = "Penjelasan informasi",
  variant = "info",
  side = "top",
  className = "",
}: InfoTooltipProps) {
  const [isOpen, setIsOpen] = useState(false);
  const isClient = useIsClient();
  const [coords, setCoords] = useState<{
    top: number;
    left: number;
    placedOn: "top" | "bottom";
    width: number;
  }>({
    top: 0,
    left: 0,
    placedOn: "top",
    width: 280,
  });

  const buttonRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const tooltipId = useId();
  const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const updatePosition = useCallback(() => {
    if (!buttonRef.current) return;
    const triggerRect = buttonRef.current.getBoundingClientRect();

    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;
    const tooltipWidth = Math.min(300, screenWidth - 24);
    const measuredHeight = tooltipRef.current?.offsetHeight ?? 160;

    // Hitung posisi horizontal (tengah di atas/bawah trigger, dibatasi tepi layar)
    let left = triggerRect.left + triggerRect.width / 2 - tooltipWidth / 2;
    left = Math.max(12, Math.min(left, screenWidth - tooltipWidth - 12));

    const spaceAbove = triggerRect.top;
    const spaceBelow = screenHeight - triggerRect.bottom;

    // Tentukan penempatan vertikal (top vs bottom) secara adaptif
    let placedOn: "top" | "bottom";
    if (side === "bottom") {
      placedOn =
        spaceBelow >= measuredHeight + 12 || spaceBelow >= spaceAbove
          ? "bottom"
          : "top";
    } else {
      // Jika memilih "top", pastikan ruang atas benar-benar cukup dan tidak terpotong
      if (spaceAbove >= measuredHeight + 16) {
        placedOn = "top";
      } else if (spaceBelow >= measuredHeight + 16) {
        placedOn = "bottom";
      } else {
        placedOn = spaceBelow >= spaceAbove ? "bottom" : "top";
      }
    }

    // Hitung koordinat top absolut viewport tanpa translateY agar anti-clipping
    let top: number;
    if (placedOn === "top") {
      top = triggerRect.top - 8 - measuredHeight;
      top = Math.max(12, top);
    } else {
      top = triggerRect.bottom + 8;
      top = Math.min(top, screenHeight - measuredHeight - 12);
      top = Math.max(12, top);
    }

    setCoords({ top, left, placedOn, width: tooltipWidth });
  }, [side]);

  // Buka tooltip dan sinkronisasi posisi
  const handleOpen = useCallback(() => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    updatePosition();
    setIsOpen(true);
  }, [updatePosition]);

  // Tutup tooltip dengan toleransi delay halus
  const handleClose = useCallback(() => {
    closeTimeoutRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 120);
  }, []);

  // Update dan ukur ulang posisi secara akurat setelah tooltip mount di DOM
  useEffect(() => {
    if (!isOpen) return;

    // Ukur ulang setelah render awal untuk mendapatkan tinggi aktual dari DOM
    const frameId = requestAnimationFrame(() => {
      updatePosition();
    });

    function handleScrollOrResize() {
      updatePosition();
    }

    function handlePointerDown(e: MouseEvent | TouchEvent) {
      const target = e.target as Node;
      if (
        buttonRef.current?.contains(target) ||
        tooltipRef.current?.contains(target)
      ) {
        return;
      }
      setIsOpen(false);
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    }

    window.addEventListener("scroll", handleScrollOrResize, { passive: true });
    window.addEventListener("resize", handleScrollOrResize, { passive: true });
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("scroll", handleScrollOrResize);
      window.removeEventListener("resize", handleScrollOrResize);
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, updatePosition]);

  return (
    <span className={`inline-flex items-center align-middle ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        aria-describedby={isOpen ? tooltipId : undefined}
        aria-expanded={isOpen}
        aria-label={label}
        onMouseEnter={handleOpen}
        onMouseLeave={handleClose}
        onFocus={handleOpen}
        onBlur={handleClose}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (isOpen) {
            setIsOpen(false);
          } else {
            handleOpen();
          }
        }}
        className={`inline-flex items-center justify-center h-4 w-4 rounded-full text-[11px] font-semibold transition-colors cursor-pointer select-none focus-visible:outline-2 focus-visible:outline-teal-700 ${
          variant === "warning"
            ? "bg-amber-100 text-amber-800 hover:bg-amber-200"
            : variant === "help"
              ? "bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900"
              : "bg-teal-50 text-teal-700 hover:bg-teal-100 hover:text-teal-900"
        }`}
      >
        {variant === "warning" ? "!" : "ⓘ"}
      </button>

      {/* Render via Portal langsung ke document.body agar tidak pernah terpotong overflow-hidden apapun */}
      {isClient &&
        isOpen &&
        createPortal(
          <span
            ref={tooltipRef}
            id={tooltipId}
            role="tooltip"
            onMouseEnter={handleOpen}
            onMouseLeave={handleClose}
            style={{
              position: "fixed",
              top: `${coords.top}px`,
              left: `${coords.left}px`,
              width: `${coords.width}px`,
              maxHeight: "calc(100vh - 24px)",
              overflowY: "auto",
            }}
            className="z-[9999] p-3 text-xs rounded-xl bg-slate-900 text-slate-100 shadow-2xl shadow-slate-950/40 border border-slate-800 pointer-events-auto select-text font-normal leading-relaxed text-left animate-in fade-in zoom-in-95 duration-100"
          >
            {title && (
              <span className="block font-semibold text-slate-50 mb-1 border-b border-slate-800/80 pb-1">
                {title}
              </span>
            )}
            <span className="block text-slate-300 text-[11.5px] leading-relaxed">
              {content}
            </span>

            {/* Tombol tutup khusus perangkat sentuh / mobile */}
            <span className="mt-2 pt-1.5 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-400 sm:hidden">
              <span>Ketuk di luar untuk menutup</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsOpen(false);
                }}
                className="text-teal-400 font-medium px-1.5 py-0.5 hover:underline"
              >
                Tutup
              </button>
            </span>
          </span>,
          document.body
        )}
    </span>
  );
}
