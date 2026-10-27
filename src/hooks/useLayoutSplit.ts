import { useState, useRef, useCallback } from "react";

export function useLayoutSplit() {
  // Sidebar (changes & commit) sizing
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("tongyun_sidebar_width");
      return saved ? Math.max(220, Math.min(600, parseInt(saved, 10))) : 320;
    } catch {
      return 320;
    }
  });
  const isResizingRef = useRef(false);

  // Project file tree column sizing & collapse
  const [treeWidth, setTreeWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("tongyun_tree_width");
      return saved ? Math.max(180, Math.min(420, parseInt(saved, 10))) : 240;
    } catch {
      return 240;
    }
  });

  const [treeCollapsed, setTreeCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem("tongyun_tree_collapsed") === "true";
    } catch {
      return false;
    }
  });

  const isTreeResizingRef = useRef(false);

  // Toggle tree collapsed state and persist
  const toggleTreeCollapsed = useCallback(() => {
    setTreeCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("tongyun_tree_collapsed", String(next));
      } catch {
        // Storage failure ignored
      }
      return next;
    });
  }, []);

  // Resizing project tree column
  const handleMouseDownTreeResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isTreeResizingRef.current = true;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isTreeResizingRef.current) return;
      const newWidth = Math.max(180, Math.min(420, moveEvent.clientX));
      setTreeWidth(newWidth);
    };

    const handleMouseUp = (upEvent: MouseEvent) => {
      isTreeResizingRef.current = false;
      const finalWidth = Math.max(180, Math.min(420, upEvent.clientX));
      try {
        localStorage.setItem("tongyun_tree_width", finalWidth.toString());
      } catch {
        // Storage failure ignored
      }
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  }, []);

  // Resizing left sidebar (changes list & commit area)
  const handleMouseDownResize = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isResizingRef.current = true;
      const treeOffset = treeCollapsed ? 28 : treeWidth;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!isResizingRef.current) return;
        const newWidth = Math.max(220, Math.min(600, moveEvent.clientX - treeOffset));
        setSidebarWidth(newWidth);
      };

      const handleMouseUp = (upEvent: MouseEvent) => {
        isResizingRef.current = false;
        const finalWidth = Math.max(220, Math.min(600, upEvent.clientX - treeOffset));
        try {
          localStorage.setItem("tongyun_sidebar_width", finalWidth.toString());
        } catch {
          // Storage failure ignored
        }
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };

      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    },
    [treeCollapsed, treeWidth]
  );

  return {
    sidebarWidth,
    setSidebarWidth,
    treeWidth,
    setTreeWidth,
    treeCollapsed,
    setTreeCollapsed,
    toggleTreeCollapsed,
    handleMouseDownTreeResize,
    handleMouseDownResize,
  };
}
