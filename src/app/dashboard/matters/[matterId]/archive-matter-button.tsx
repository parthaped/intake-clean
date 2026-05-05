"use client";

import { useTransition } from "react";
import { ArchiveRestore, ArchiveX } from "lucide-react";
import { toast } from "sonner";

import { archiveMatterAction, unarchiveMatterAction } from "@/app/dashboard/matters/actions";
import { Button } from "@/components/ui/button";
import type { MatterStatus } from "@/types/database";

interface Props {
  matterId: string;
  status: MatterStatus;
}

/**
 * Reversible "retire this matter" toggle. Archived matters disappear from
 * the default Matters list and stop counting against the plan quota
 * (`loadOrganizationUsage` filters them out), but every artifact stays
 * intact. This is the safe default for "we're done working on this case"
 * — `DeleteMatterDialog` is the irreversible counterpart.
 */
export function ArchiveMatterButton({ matterId, status }: Props) {
  const [pending, startTransition] = useTransition();
  const isArchived = status === "archived";

  function handleClick() {
    const formData = new FormData();
    formData.set("matter_id", matterId);

    startTransition(async () => {
      try {
        if (isArchived) {
          await unarchiveMatterAction(formData);
          toast.success("Matter restored");
        } else {
          await archiveMatterAction(formData);
          toast.success("Matter archived");
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not update matter");
      }
    });
  }

  return (
    <Button
      type="button"
      variant="outline"
      className="w-full justify-start"
      onClick={handleClick}
      disabled={pending}
    >
      {isArchived ? (
        <>
          <ArchiveRestore className="h-4 w-4" /> Restore from archive
        </>
      ) : (
        <>
          <ArchiveX className="h-4 w-4" /> Archive matter
        </>
      )}
    </Button>
  );
}
