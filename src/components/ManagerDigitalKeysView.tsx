import React, { useState, useMemo, useRef, useCallback, memo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { 
  Key, Search, Copy, Check, Send, Share2, Filter, 
  RefreshCw, Building2, Users, Mail, XCircle, Download, 
  Layers, CheckCircle2, ChevronRight, Hash, ShieldCheck, Trash2
} from 'lucide-react';

export interface RoomKeyItem {
  id: string;
  hostelId?: string;
  hostelName?: string;
  blockName: string;
  blockInitial?: string;
  roomNumber: string;
  floor?: number;
  roomKey: string;
  isAssigned?: boolean;
  status?: string;
  assignedStudentId?: string;
  assignedStudentName?: string;
  assignedStudentEmail?: string;
  assignedStudentPhone?: string;
  lastDispatchedTo?: string;
  lastDispatchedAt?: string;
  pricePerBlock?: number;
}

interface ManagerDigitalKeysViewProps {
  roomKeys: RoomKeyItem[];
  activeBlock: any;
  allBlocks: any[];
  onSelectBlock: (block: any) => void;
  onRefreshKeys: () => void;
  loadingKeys: boolean;
  primaryProperty: any;
  onOpenDispatch: (keyItem: RoomKeyItem) => void;
  onTriggerToast: (msg: string) => void;
  onRequestBlockChange?: () => void;
  onReleaseRoom: (keyItem: RoomKeyItem) => void;
}

// Highly optimized, memoized single key card to prevent unnecessary re-renders
const DigitalKeyCard = memo(function DigitalKeyCard({
  keyItem,
  onCopy,
  onShare,
  onDispatch,
  onRelease,
  isCopied
}: {
  keyItem: RoomKeyItem;
  onCopy: (key: string, id: string) => void;
  onShare: (keyItem: RoomKeyItem) => void;
  onDispatch: (keyItem: RoomKeyItem) => void;
  onRelease: (keyItem: RoomKeyItem) => void;
  isCopied: boolean;
}) {
  const isAssigned = Boolean(keyItem.isAssigned || keyItem.status === 'Assigned' || keyItem.status === 'Occupied');

  return (
    <div
      className={`p-4 rounded-2xl border flex flex-col justify-between space-y-3.5 transition-colors ${
        isAssigned
          ? 'bg-blue-50/40 border-blue-200'
          : 'bg-white border-slate-200 hover:border-blue-400 shadow-xs'
      }`}
      style={{ contain: 'content' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base font-black text-slate-900 tracking-tight">
            Room {keyItem.roomNumber}
          </span>
          <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
            Floor {keyItem.floor || 1}
          </span>
        </div>

        <span className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full border ${
          isAssigned
            ? 'bg-blue-100 text-blue-900 border-blue-200'
            : 'bg-emerald-100 text-emerald-900 border-emerald-200'
        }`}>
          {isAssigned ? 'Occupied' : 'Available'}
        </span>
      </div>

      {/* Monospace Code Display */}
      <div className="p-2.5 bg-slate-900 text-cyan-300 rounded-xl font-mono text-xs font-black tracking-wider flex items-center justify-between border border-slate-800 select-all">
        <div className="flex items-center gap-2 overflow-hidden">
          <Key className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          <span className="truncate">{keyItem.roomKey}</span>
        </div>
        <button
          type="button"
          onClick={() => onCopy(keyItem.roomKey, keyItem.id || keyItem.roomKey)}
          className="p-1 text-slate-400 hover:text-white rounded transition-colors cursor-pointer shrink-0 ml-2"
          title="Copy key code"
        >
          {isCopied ? (
            <span className="text-[10px] text-emerald-400 font-sans font-bold flex items-center gap-0.5">
              <Check className="w-3 h-3" /> Copied
            </span>
          ) : (
            <Copy className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      {/* Dispatched or Resident info */}
      {keyItem.lastDispatchedTo && (
        <div className="text-[11px] text-slate-600 bg-slate-50 p-2 rounded-lg border border-slate-200/60 flex items-center gap-1.5 truncate">
          <Mail className="w-3 h-3 text-slate-400 shrink-0" />
          <span className="truncate">Sent to: <strong className="text-slate-800">{keyItem.lastDispatchedTo}</strong></span>
        </div>
      )}

      {isAssigned && keyItem.assignedStudentName && (
        <div className="text-[11px] text-blue-900 bg-blue-100/60 p-2 rounded-lg border border-blue-200/50 flex items-center gap-1.5 truncate">
          <Users className="w-3 h-3 text-blue-600 shrink-0" />
          <span className="truncate">Resident: <strong>{keyItem.assignedStudentName}</strong></span>
        </div>
      )}

      {/* Action Buttons */}
      {isAssigned && (
        <button type="button" onClick={() => onRelease(keyItem)} className="flex items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100 cursor-pointer">
          <Trash2 className="h-3.5 w-3.5" />
          <span>Remove Occupant</span>
        </button>
      )}
      <div className="grid grid-cols-2 gap-2 pt-1">
        <button
          type="button"
          onClick={() => onDispatch(keyItem)}
          className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
        >
          <Send className="w-3 h-3" />
          <span>Send Key</span>
        </button>

        <button
          type="button"
          onClick={() => onShare(keyItem)}
          className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
          title="Copy formatted share message"
        >
          <Share2 className="w-3 h-3" />
          <span>Share</span>
        </button>
      </div>
    </div>
  );
});

export default function ManagerDigitalKeysView({
  roomKeys,
  activeBlock,
  allBlocks,
  onSelectBlock,
  onRefreshKeys,
  loadingKeys,
  primaryProperty,
  onOpenDispatch,
  onTriggerToast,
  onReleaseRoom,
  onRequestBlockChange
}: ManagerDigitalKeysViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'available' | 'occupied'>('all');
  const [floorFilter, setFloorFilter] = useState<number | 'all'>('all');
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);

  // Parent virtualizer scroll container ref
  const parentScrollRef = useRef<HTMLDivElement>(null);

  // Determine number of columns based on container width or responsive standard
  const [columnsCount, setColumnsCount] = useState<number>(3);

  React.useEffect(() => {
    const updateColumns = () => {
      const width = parentScrollRef.current ? parentScrollRef.current.clientWidth : window.innerWidth;
      if (width < 600) {
        setColumnsCount(1);
      } else if (width < 960) {
        setColumnsCount(2);
      } else {
        setColumnsCount(3);
      }
    };

    updateColumns();
    window.addEventListener('resize', updateColumns);
    return () => window.removeEventListener('resize', updateColumns);
  }, []);

  // Pre-calculate block room keys map for instant block switching
  const blockKeys = useMemo(() => {
    if (!activeBlock) return roomKeys;
    const targetBlockName = activeBlock.blockName || activeBlock.name;
    const targetPrefix = activeBlock.roomPrefix;

    const filtered = roomKeys.filter((rk: RoomKeyItem) => {
      if (!rk) return false;
      const matchName = rk.blockName === targetBlockName || 
                        rk.blockName?.toLowerCase() === targetBlockName?.toLowerCase();
      const matchInitial = targetPrefix && rk.blockInitial === targetPrefix;
      const matchPrefix = targetPrefix && rk.roomNumber && rk.roomNumber.startsWith(targetPrefix);
      return matchName || matchInitial || matchPrefix;
    });

    return filtered.length > 0 ? filtered : roomKeys;
  }, [roomKeys, activeBlock]);

  // Extract all unique floors present in this block
  const availableFloors = useMemo(() => {
    const floorsSet = new Set<number>();
    blockKeys.forEach(k => {
      if (typeof k.floor === 'number' && k.floor > 0) {
        floorsSet.add(k.floor);
      }
    });
    return Array.from(floorsSet).sort((a, b) => a - b);
  }, [blockKeys]);

  // Fast memoized filtered list
  const filteredKeys = useMemo(() => {
    let result = blockKeys;

    // Status filter
    if (statusFilter === 'available') {
      result = result.filter(k => !k.isAssigned && k.status !== 'Occupied' && k.status !== 'Assigned');
    } else if (statusFilter === 'occupied') {
      result = result.filter(k => k.isAssigned || k.status === 'Occupied' || k.status === 'Assigned');
    }

    // Floor filter
    if (floorFilter !== 'all') {
      result = result.filter(k => (k.floor || 1) === floorFilter);
    }

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(k => 
        (k.roomNumber && k.roomNumber.toLowerCase().includes(q)) ||
        (k.roomKey && k.roomKey.toLowerCase().includes(q)) ||
        (k.blockName && k.blockName.toLowerCase().includes(q)) ||
        `floor ${k.floor}`.includes(q) ||
        `${k.floor}` === q ||
        (k.lastDispatchedTo && k.lastDispatchedTo.toLowerCase().includes(q)) ||
        (k.assignedStudentName && k.assignedStudentName.toLowerCase().includes(q)) ||
        (k.assignedStudentEmail && k.assignedStudentEmail.toLowerCase().includes(q))
      );
    }

    return result;
  }, [blockKeys, statusFilter, floorFilter, searchQuery]);

  // Group filtered keys into rows for multi-column virtualization
  const virtualRows = useMemo(() => {
    const rows: RoomKeyItem[][] = [];
    for (let i = 0; i < filteredKeys.length; i += columnsCount) {
      rows.push(filteredKeys.slice(i, i + columnsCount));
    }
    return rows;
  }, [filteredKeys, columnsCount]);

  // Virtualizer hook from @tanstack/react-virtual
  const rowVirtualizer = useVirtualizer({
    count: virtualRows.length,
    getScrollElement: () => parentScrollRef.current,
    estimateSize: () => 210, // approximate height of card + gap
    overscan: 4 // keep 4 extra rows rendered above and below viewport for instant lag-free scrolling
  });

  const handleCopy = useCallback((keyString: string, keyId: string) => {
    navigator.clipboard.writeText(keyString);
    setCopiedKeyId(keyId);
    onTriggerToast(`Key "${keyString}" copied to clipboard!`);
    setTimeout(() => {
      setCopiedKeyId(null);
    }, 2000);
  }, [onTriggerToast]);

  const handleShare = useCallback((keyItem: RoomKeyItem) => {
    const shareText = `*PineVela Room Key Access*\nResidence: ${primaryProperty?.name || 'Hostel'}\nBlock: ${keyItem.blockName}\nRoom: ${keyItem.roomNumber}\n*Digital Key Code:* ${keyItem.roomKey}\n\nUse this digital key on the PineVela student portal to link your room console.`;
    navigator.clipboard.writeText(shareText);
    onTriggerToast(`Access details for Room ${keyItem.roomNumber} copied to clipboard!`);
  }, [primaryProperty, onTriggerToast]);

  // Batch Export CSV for manager records
  const handleExportKeysCsv = useCallback(() => {
    if (filteredKeys.length === 0) return;
    const headers = ["Room Number", "Block", "Floor", "Digital Key", "Status", "Resident Name", "Dispatched To"];
    const rows = filteredKeys.map(k => [
      `"${k.roomNumber || ''}"`,
      `"${k.blockName || ''}"`,
      `"${k.floor || 1}"`,
      `"${k.roomKey || ''}"`,
      `"${k.isAssigned ? 'Occupied' : 'Available'}"`,
      `"${k.assignedStudentName || ''}"`,
      `"${k.lastDispatchedTo || ''}"`
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `PineVela_DigitalKeys_${activeBlock?.blockName || 'Block'}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    onTriggerToast(`Exported ${filteredKeys.length} digital room keys as CSV!`);
  }, [filteredKeys, activeBlock, onTriggerToast]);

  const totalBlockRooms = activeBlock?.totalRooms ?? blockKeys.length;
  const availableCount = useMemo(() => blockKeys.filter(k => !k.isAssigned && k.status !== 'Occupied').length, [blockKeys]);
  const occupiedCount = blockKeys.length - availableCount;
  const occupancyPercent = blockKeys.length > 0 ? Math.round((occupiedCount / blockKeys.length) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Top Block Selector Cards */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
            <Building2 className="w-4 h-4 text-blue-600" />
            <span>Select Residence Wing / Block</span>
          </h3>
          <span className="text-xs font-semibold text-slate-500">
            {allBlocks.length} Physical Wings Configured
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {allBlocks.map((block: any, idx: number) => {
            const isSelected = (activeBlock?.blockName || activeBlock?.name) === (block.blockName || block.name);
            const thisBlockKeys = roomKeys.filter((rk: RoomKeyItem) => 
              rk.blockName === block.blockName || 
              rk.blockName?.toLowerCase() === block.blockName?.toLowerCase() ||
              rk.blockInitial === block.roomPrefix ||
              (rk.roomNumber && block.roomPrefix && rk.roomNumber.startsWith(block.roomPrefix))
            );

            return (
              <button
                key={block.id || idx}
                type="button"
                onClick={() => onSelectBlock(block)}
                className={`text-left p-5 rounded-2xl border transition-colors cursor-pointer flex flex-col justify-between space-y-3 ${
                  isSelected
                    ? 'bg-blue-50/80 border-blue-500 ring-2 ring-blue-400/30'
                    : 'bg-white border-slate-200 hover:border-blue-300 hover:bg-slate-50/50'
                }`}
              >
                <div className="flex items-start justify-between w-full">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white shadow-xs ${
                      isSelected ? 'bg-blue-600' : 'bg-slate-700'
                    }`}>
                      <Building2 className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-base font-black text-slate-900">{block.blockName || block.name}</h4>
                      <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wider">
                        {block.genderCategory || 'Mixed Community'}
                      </span>
                    </div>
                  </div>

                  {isSelected && (
                    <span className="text-[10px] font-black text-blue-700 bg-blue-100 px-2.5 py-1 rounded-full flex items-center gap-1">
                      <Check className="w-3 h-3" /> Active
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 text-xs w-full">
                  <div className="p-2 bg-slate-50 rounded-lg text-center">
                    <span className="block text-[9px] text-slate-400 font-bold uppercase">Keys</span>
                    <span className="font-black text-blue-600">{thisBlockKeys.length || block.totalRooms || 20}</span>
                  </div>
                  <div className="p-2 bg-slate-50 rounded-lg text-center">
                    <span className="block text-[9px] text-slate-400 font-bold uppercase">Floors</span>
                    <span className="font-black text-slate-800">{block.floors || 4}</span>
                  </div>
                  <div className="p-2 bg-slate-50 rounded-lg text-center">
                    <span className="block text-[9px] text-slate-400 font-bold uppercase">Prefix</span>
                    <span className="font-black text-slate-800">{block.roomPrefix || 'A'}-</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Keys Viewport Box */}
      <div className="bg-white border border-slate-200 rounded-3xl p-5 md:p-6 shadow-xs space-y-5">
        
        {/* Block Header & Live Metrics */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-5">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20 shrink-0">
              <Key className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-xl font-black text-slate-900 tracking-tight">
                  {activeBlock?.blockName || 'Active Block'} Digital Access Keys
                </h3>
                <span className="text-[10px] font-black uppercase tracking-wider text-blue-800 bg-blue-100 px-2.5 py-0.5 rounded-full">
                  {activeBlock?.genderCategory || 'Accredited Wing'}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {activeBlock?.floors ?? 0} Floors • {blockKeys.length} Total Rooms • {occupancyPercent}% Occupancy Rate
              </p>
            </div>
          </div>

          {/* Quick Metrics & Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="px-3 py-1.5 bg-blue-50 border border-blue-100 rounded-xl text-xs font-bold text-blue-900">
              Total Keys: <span className="font-black text-blue-700">{blockKeys.length}</span>
            </div>
            <div className="px-3 py-1.5 bg-emerald-50 border border-emerald-100 rounded-xl text-xs font-bold text-emerald-900">
              Available: <span className="font-black text-emerald-700">{availableCount}</span>
            </div>
            <div className="px-3 py-1.5 bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-700">
              Occupied: <span className="font-black text-slate-900">{occupiedCount}</span>
            </div>
            
            <button
              type="button"
              onClick={handleExportKeysCsv}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
              title="Download key list as CSV file"
            >
              <Download className="w-3.5 h-3.5 text-slate-600" />
              <span>Export CSV</span>
            </button>

            <button
              type="button"
              onClick={onRefreshKeys}
              disabled={loadingKeys}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors shadow-xs"
              title="Sync latest room key statuses"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingKeys ? 'animate-spin' : ''}`} />
              <span>{loadingKeys ? 'Syncing...' : 'Sync'}</span>
            </button>
          </div>
        </div>

        {/* Search, Status Filter & Floor Selector Toolbar */}
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={`Search room number (e.g. ${activeBlock?.roomPrefix || 'A'}-101), key code, resident name, or email...`}
                className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
              />
              {searchQuery && (
                <button 
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <XCircle className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Status Filter Tabs */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 shrink-0">
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                  statusFilter === 'all'
                    ? 'bg-white text-blue-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All ({blockKeys.length})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('available')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                  statusFilter === 'available'
                    ? 'bg-white text-emerald-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Available ({availableCount})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('occupied')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                  statusFilter === 'occupied'
                    ? 'bg-white text-blue-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Occupied ({occupiedCount})
              </button>
            </div>
          </div>

          {/* Quick Floor Filter Tabs for 1000+ key navigations */}
          {availableFloors.length > 1 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1 shrink-0">Floor:</span>
              <button
                type="button"
                onClick={() => setFloorFilter('all')}
                className={`px-3 py-1 rounded-lg font-bold shrink-0 transition-colors cursor-pointer ${
                  floorFilter === 'all'
                    ? 'bg-blue-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                All Floors
              </button>
              {availableFloors.map(floorNum => (
                <button
                  key={floorNum}
                  type="button"
                  onClick={() => setFloorFilter(floorNum)}
                  className={`px-3 py-1 rounded-lg font-bold shrink-0 transition-colors cursor-pointer ${
                    floorFilter === floorNum
                      ? 'bg-blue-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Floor {floorNum}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Smooth Virtualized Scrolling Grid */}
        {filteredKeys.length > 0 ? (
          <div
            ref={parentScrollRef}
            className="w-full h-[620px] overflow-y-auto overflow-x-hidden rounded-2xl border border-slate-100 bg-slate-50/30 p-2 custom-scrollbar"
            style={{ contain: 'strict' }}
          >
            <div
              style={{
                height: `${rowVirtualizer.getTotalSize()}px`,
                width: '100%',
                position: 'relative'
              }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const rowItems = virtualRows[virtualRow.index] || [];
                return (
                  <div
                    key={virtualRow.key}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${virtualRow.start}px)`
                    }}
                    className={`grid gap-4 py-2 ${
                      columnsCount === 1 
                        ? 'grid-cols-1' 
                        : columnsCount === 2 
                        ? 'grid-cols-2' 
                        : 'grid-cols-3'
                    }`}
                  >
                    {rowItems.map((keyItem) => (
                      <DigitalKeyCard
                        key={keyItem.id || keyItem.roomKey}
                        keyItem={keyItem}
                        onCopy={handleCopy}
                        onShare={handleShare}
                        onDispatch={onOpenDispatch}
                        onRelease={onReleaseRoom}
                        isCopied={copiedKeyId === (keyItem.id || keyItem.roomKey)}
                      />
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="p-12 text-center border-2 border-dashed border-slate-200 rounded-2xl space-y-3">
            <Key className="w-10 h-10 text-slate-300 mx-auto" />
            <p className="text-sm font-bold text-slate-700">
              {searchQuery ? `No rooms match search "${searchQuery}"` : 'No room keys available'}
            </p>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              {searchQuery ? 'Try clearing your search query or adjusting the filters.' : 'Click sync to generate and refresh cryptographic keys for this block.'}
            </p>
            {searchQuery ? (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setStatusFilter('all');
                  setFloorFilter('all');
                }}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl cursor-pointer"
              >
                Reset All Filters
              </button>
            ) : (
              <button
                type="button"
                onClick={onRefreshKeys}
                disabled={loadingKeys}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl cursor-pointer inline-flex items-center gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingKeys ? 'animate-spin' : ''}`} />
                <span>{loadingKeys ? 'Generating...' : 'Synchronize Room Keys'}</span>
              </button>
            )}
          </div>
        )}

        {/* Footer info & Count Summary */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500 pt-2 border-t border-slate-100">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-700">
              Showing {filteredKeys.length} of {blockKeys.length} keys in {activeBlock?.blockName || 'this block'}
            </span>
            {filteredKeys.length < blockKeys.length && (
              <span className="text-[10px] text-blue-600 bg-blue-50 px-2 py-0.5 rounded font-semibold">Filtered View</span>
            )}
          </div>
          <div className="text-[11px] text-slate-400">
            Hardware-accelerated virtual rendering • Smooth 60 FPS scrolling
          </div>
        </div>

      </div>
    </div>
  );
}
