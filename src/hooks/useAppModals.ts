import { useState, useCallback } from "react";
import type { DiscardCandidate } from "../lib/host";
import type { WorkspaceTab } from "../features/workspace/WorkspaceTools";

export function useAppModals() {
  // Repository open / clone modal
  const [openModalVisible, setOpenModalVisible] = useState(false);
  const [openModalTab, setOpenModalTab] = useState<"open" | "clone">("open");
  const [openError, setOpenError] = useState<string | null>(null);
  const [openLoading, setOpenLoading] = useState(false);
  const [openAttemptPath, setOpenAttemptPath] = useState("");

  // Settings modal
  const [settingsModalVisible, setSettingsModalVisible] = useState(false);
  const [settingsTab, setSettingsTab] = useState<"general" | "ai">("general");

  // Branch modals
  const [branchModalOpen, setBranchModalOpen] = useState(false);
  const [createBranchModalOpen, setCreateBranchModalOpen] = useState(false);
  const [createBranchStartPoint, setCreateBranchStartPoint] = useState<string | null>(null);

  // Remote & Sync modals
  const [pushModalOpen, setPushModalOpen] = useState(false);
  const [logModalOpen, setLogModalOpen] = useState(false);
  const [stashModalOpen, setStashModalOpen] = useState(false);
  const [createStashModalOpen, setCreateStashModalOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  // Tag modals
  const [tagModalOpen, setTagModalOpen] = useState(false);
  const [createTagModalOpen, setCreateTagModalOpen] = useState(false);
  const [createTagTargetOid, setCreateTagTargetOid] = useState<string | null>(null);

  // File history modal
  const [fileHistoryModalOpen, setFileHistoryModalOpen] = useState(false);
  const [historyFilePath, setHistoryFilePath] = useState("");

  // Help & About modals
  const [shortcutsModalOpen, setShortcutsModalOpen] = useState(false);
  const [aboutModalOpen, setAboutModalOpen] = useState(false);

  // Discard confirmation modal
  const [discardModalVisible, setDiscardModalVisible] = useState(false);
  const [discardCandidates, setDiscardCandidates] = useState<DiscardCandidate[]>([]);
  const [discardLoading, setDiscardLoading] = useState(false);

  // 3-Way Conflict Resolver
  const [conflictModalOpen, setConflictModalOpen] = useState(false);
  const [conflictModalTargetFile, setConflictModalTargetFile] = useState<string | null>(null);

  const handleOpenConflictModal = useCallback((filePath?: string) => {
    setConflictModalTargetFile(filePath || null);
    setConflictModalOpen(true);
  }, []);

  // Interactive Rebase
  const [rebaseModalOpen, setRebaseModalOpen] = useState(false);
  const [rebaseBaseOid, setRebaseBaseOid] = useState<string>("");
  const [rebaseBaseSummary, setRebaseBaseSummary] = useState<string | undefined>(undefined);

  const handleOpenInteractiveRebase = useCallback(
    (baseOid: string, baseSummary?: string) => {
      setRebaseBaseOid(baseOid);
      setRebaseBaseSummary(baseSummary);
      setRebaseModalOpen(true);
    },
    []
  );

  // Worktree Management
  const [worktreeModalOpen, setWorktreeModalOpen] = useState(false);

  // Workspace Tools drawer
  const [workspaceTools, setWorkspaceTools] = useState<{
    tab: WorkspaceTab;
    target?: string;
  } | null>(null);

  return {
    // Open / Clone
    openModalVisible,
    setOpenModalVisible,
    openModalTab,
    setOpenModalTab,
    openError,
    setOpenError,
    openLoading,
    setOpenLoading,
    openAttemptPath,
    setOpenAttemptPath,

    // Settings
    settingsModalVisible,
    setSettingsModalVisible,
    settingsTab,
    setSettingsTab,

    // Branch
    branchModalOpen,
    setBranchModalOpen,
    createBranchModalOpen,
    setCreateBranchModalOpen,
    createBranchStartPoint,
    setCreateBranchStartPoint,

    // Remote / Sync / Stash
    pushModalOpen,
    setPushModalOpen,
    logModalOpen,
    setLogModalOpen,
    stashModalOpen,
    setStashModalOpen,
    createStashModalOpen,
    setCreateStashModalOpen,
    commandPaletteOpen,
    setCommandPaletteOpen,

    // Tag
    tagModalOpen,
    setTagModalOpen,
    createTagModalOpen,
    setCreateTagModalOpen,
    createTagTargetOid,
    setCreateTagTargetOid,

    // History
    fileHistoryModalOpen,
    setFileHistoryModalOpen,
    historyFilePath,
    setHistoryFilePath,

    // Help & About
    shortcutsModalOpen,
    setShortcutsModalOpen,
    aboutModalOpen,
    setAboutModalOpen,

    // Discard
    discardModalVisible,
    setDiscardModalVisible,
    discardCandidates,
    setDiscardCandidates,
    discardLoading,
    setDiscardLoading,

    // Conflict
    conflictModalOpen,
    setConflictModalOpen,
    conflictModalTargetFile,
    setConflictModalTargetFile,
    handleOpenConflictModal,

    // Rebase
    rebaseModalOpen,
    setRebaseModalOpen,
    rebaseBaseOid,
    setRebaseBaseOid,
    rebaseBaseSummary,
    setRebaseBaseSummary,
    handleOpenInteractiveRebase,

    // Worktree
    worktreeModalOpen,
    setWorktreeModalOpen,

    // Workspace Tools
    workspaceTools,
    setWorkspaceTools,
  };
}
