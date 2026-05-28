"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  closestCorners,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import type { Deal, PipelineStage } from "@/types";
import { DealCard } from "./deal-card";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";

interface PipelineBoardProps {
  stages: PipelineStage[];
  deals: Deal[];
  onDealMoved: (dealId: string, newStageId: string) => void;
  onAddDeal: (stageId: string) => void;
  onEditDeal: (deal: Deal) => void;
  canManage?: boolean;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function PipelineBoard({
  stages,
  deals,
  onDealMoved,
  onAddDeal,
  onEditDeal,
  canManage = true,
}: PipelineBoardProps) {
  const { t } = useLanguage();
  const [activeDealId, setActiveDealId] = useState<string | null>(null);

  const sortedStages = useMemo(
    () => [...stages].sort((a, b) => a.position - b.position),
    [stages],
  );

  const dealsByStage = useMemo(() => {
    const map = new Map<string, Deal[]>();
    for (const stage of sortedStages) map.set(stage.id, []);
    for (const deal of deals) {
      const bucket = map.get(deal.stage_id);
      if (bucket) bucket.push(deal);
    }
    return map;
  }, [sortedStages, deals]);

  const sensors = useSensors(
    // 5px activation distance avoids clicks being interpreted as drags.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    // Keyboard drag support: focus a card, Space to pick up, arrows to move,
    // Space to drop, Escape to cancel.
    useSensor(KeyboardSensor),
  );

  const activeDeal = activeDealId
    ? deals.find((d) => d.id === activeDealId) ?? null
    : null;

  function handleDragStart(event: DragStartEvent) {
    if (!canManage) return;
    setActiveDealId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveDealId(null);
    if (!canManage) return;
    const { active, over } = event;
    if (!over) return;
    const dealId = String(active.id);
    const targetStageId = String(over.id);

    const deal = deals.find((d) => d.id === dealId);
    if (!deal || deal.stage_id === targetStageId) return;
    if (!sortedStages.some((s) => s.id === targetStageId)) return;

    onDealMoved(dealId, targetStageId);
  }

  function handleDragCancel() {
    setActiveDealId(null);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      {/* snap-x + snap-mandatory on mobile so swipes land the next
          stage cleanly at the viewport edge instead of mid-column.
          Disabled on lg+ because the full board fits without scroll
          there and snapping would interfere with the natural layout. */}
      <div className="pipeline-scroll flex snap-x snap-mandatory gap-3 overflow-x-auto pb-4 lg:snap-none">
        {sortedStages.map((stage) => {
          const stageDeals = dealsByStage.get(stage.id) ?? [];
          const totalValue = stageDeals.reduce(
            (s, d) => s + Number(d.value || 0),
            0,
          );
          return (
            <StageColumn
              key={stage.id}
              stage={stage}
              deals={stageDeals}
              totalValue={totalValue}
              onAddDeal={onAddDeal}
              onEditDeal={onEditDeal}
              canManage={canManage}
              translateStageName={(name) => translateStageName(name, t)}
            />
          );
        })}
      </div>

      <DragOverlay
        dropAnimation={{
          duration: 200,
          easing: "cubic-bezier(0.2, 0, 0, 1)",
        }}
      >
        {activeDeal ? (
          <div className="opacity-90">
            <DealCard
              deal={activeDeal}
              stage={
                sortedStages.find((s) => s.id === activeDeal.stage_id) ?? null
              }
              onEdit={() => {}}
              isOverlay
              canEdit={canManage}
            />
          </div>
        ) : null}
      </DragOverlay>

      <style jsx>{`
        .pipeline-scroll {
          scroll-behavior: smooth;
        }
        @media (hover: hover) and (pointer: fine) {
          .pipeline-scroll::-webkit-scrollbar {
            height: 0;
            display: none;
          }
          .pipeline-scroll {
            scrollbar-width: none;
          }
        }
      `}</style>
    </DndContext>
  );
}

function translateStageName(
  name: string,
  t: ReturnType<typeof useLanguage>["t"],
) {
  const normalized = name.toLowerCase();
  if (normalized === "new lead") return t("pipelinesPage.stages.newLead");
  if (normalized === "qualified") return t("pipelinesPage.stages.qualified");
  if (normalized === "proposal sent") {
    return t("pipelinesPage.stages.proposalSent");
  }
  if (normalized === "negotiation") {
    return t("pipelinesPage.stages.negotiation");
  }
  if (normalized === "won") return t("pipelinesPage.stages.won");
  if (normalized === "lost") return t("pipelinesPage.stages.lost");
  return name;
}

function StageColumn({
  stage,
  deals,
  totalValue,
  onAddDeal,
  onEditDeal,
  canManage,
  translateStageName,
}: {
  stage: PipelineStage;
  deals: Deal[];
  totalValue: number;
  onAddDeal: (stageId: string) => void;
  onEditDeal: (deal: Deal) => void;
  canManage: boolean;
  translateStageName: (name: string) => string;
}) {
  const { t } = useLanguage();
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });

  return (
    // On mobile each column is `w-[85vw]` (with a reasonable min/max)
    // so the next column's edge peeks in — a "there's more here" hint.
    // snap-start lands each column cleanly when swiping. On lg+ we
    // restore the flex-1 share-the-row behavior. The droppable ref is
    // on the inner messages region below — intentionally NOT here, so
    // a drag over the column header doesn't highlight the whole column.
    <div className="flex w-[85vw] min-w-[260px] max-w-[320px] shrink-0 snap-start flex-col rounded-xl border border-slate-800 bg-slate-900/60 p-4 lg:w-auto lg:max-w-none lg:flex-1 lg:basis-[260px] lg:shrink lg:snap-none">
      {/* 3px colored top border — sits above the column's padding */}
      <div
        className="-mx-4 -mt-4 h-[3px] rounded-t-xl"
        style={{ backgroundColor: stage.color }}
      />
      <div className="flex items-center justify-between pt-3">
        <h3 className="truncate text-sm font-semibold text-white">
          {translateStageName(stage.name)}
        </h3>
        <span className="shrink-0 rounded-full bg-slate-800 px-2 py-0.5 text-[11px] font-medium text-slate-300">
          {deals.length}
        </span>
      </div>
      <p className="text-xs text-slate-400">{formatCurrency(totalValue)}</p>

      <div
        ref={setNodeRef}
        className={`mt-3 flex flex-1 flex-col gap-2 rounded-lg transition-all ${
          isOver
            ? "bg-primary/5 outline outline-2 outline-dashed outline-primary outline-offset-2"
            : ""
        }`}
      >
        {deals.length === 0 ? (
          <div className="flex flex-1 items-center justify-center rounded-lg border-2 border-dashed border-slate-700 py-10 text-xs text-slate-500">
            {t("pipelinesPage.board.dropDeal")}
          </div>
        ) : (
          deals.map((deal) => (
            <DraggableDealCard
              key={deal.id}
              deal={deal}
              stage={stage}
              onEdit={onEditDeal}
              canManage={canManage}
            />
          ))
        )}
      </div>

      {canManage && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onAddDeal(stage.id)}
          className="mt-3 w-full justify-start border border-dashed border-slate-700 bg-transparent text-slate-400 hover:border-slate-600 hover:bg-slate-800 hover:text-white"
        >
          <Plus className="mr-1 h-3 w-3" />
          {t("pipelinesPage.addDeal")}
        </Button>
      )}
    </div>
  );
}

function DraggableDealCard({
  deal,
  stage,
  onEdit,
  canManage,
}: {
  deal: Deal;
  stage: PipelineStage;
  onEdit: (deal: Deal) => void;
  canManage: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: deal.id,
    disabled: !canManage,
  });

  return (
    <div
      ref={setNodeRef}
      {...(canManage ? listeners : {})}
      {...(canManage ? attributes : {})}
      style={{ opacity: isDragging ? 0.3 : 1, touchAction: "none" }}
    >
      <DealCard deal={deal} stage={stage} onEdit={onEdit} canEdit={canManage} />
    </div>
  );
}
