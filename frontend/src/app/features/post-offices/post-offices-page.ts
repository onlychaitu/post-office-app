import { Component, OnInit, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { firstValueFrom } from 'rxjs';
import { apiErrorMessage } from '../../core/api-error';
import { PostOffice } from '../../core/models';
import { PostOfficeService } from '../../core/post-office.service';
import { ConfirmDialog, ConfirmDialogData } from '../../shared/confirm-dialog';
import { PostOfficeFormDialog } from './post-office-form-dialog';

@Component({
  selector: 'app-post-offices-page',
  imports: [
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressBarModule,
  ],
  templateUrl: './post-offices-page.html',
  styleUrl: './post-offices-page.scss',
})
export class PostOfficesPage implements OnInit {
  private readonly service = inject(PostOfficeService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly columns = ['zipCode', 'name', 'address', 'actions'];
  protected readonly offices = signal<PostOffice[]>([]);
  protected readonly loading = signal(false);
  protected readonly searched = signal(false);

  private search = '';
  private searchTimer: ReturnType<typeof setTimeout> | undefined;

  ngOnInit(): void {
    void this.load();
  }

  protected onSearch(value: string): void {
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.search = value.trim();
      void this.load();
    }, 250);
  }

  protected async add(): Promise<void> {
    const saved = await this.openForm(null);
    if (saved) {
      this.snackBar.open(`Post office ${saved.zipCode} created`, 'OK', { duration: 3000 });
      await this.load();
    }
  }

  protected async edit(office: PostOffice): Promise<void> {
    const saved = await this.openForm(office);
    if (saved) {
      this.snackBar.open(`Post office ${saved.zipCode} updated`, 'OK', { duration: 3000 });
      await this.load();
    }
  }

  protected async remove(office: PostOffice): Promise<void> {
    try {
      // Deleting cascades to shipments, so tell the user how many go with it.
      const { shipmentCount } = await firstValueFrom(this.service.get(office.zipCode));
      const consequence =
        shipmentCount === 0
          ? 'No shipments are linked to it.'
          : `This will also permanently delete ${shipmentCount} ${shipmentCount === 1 ? 'shipment' : 'shipments'} ` +
            `sent from or to this office, together with their status history.`;
      const confirmed = await this.confirm({
        title: `Delete post office ${office.zipCode}?`,
        message: `${office.name}\n\n${consequence}`,
        confirmLabel: 'Delete',
        destructive: true,
      });
      if (!confirmed) return;

      await firstValueFrom(this.service.delete(office.zipCode));
      this.snackBar.open(`Post office ${office.zipCode} deleted`, 'OK', { duration: 3000 });
      await this.load();
    } catch (err) {
      this.snackBar.open(apiErrorMessage(err), 'Dismiss', { duration: 5000 });
    }
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.offices.set(await firstValueFrom(this.service.list(this.search)));
      this.searched.set(this.search.length > 0);
    } catch (err) {
      this.snackBar.open(apiErrorMessage(err), 'Dismiss', { duration: 5000 });
    } finally {
      this.loading.set(false);
    }
  }

  private openForm(office: PostOffice | null): Promise<PostOffice | undefined> {
    const ref = this.dialog.open<PostOfficeFormDialog, PostOffice | null, PostOffice>(PostOfficeFormDialog, {
      data: office,
    });
    return firstValueFrom(ref.afterClosed());
  }

  private async confirm(data: ConfirmDialogData): Promise<boolean> {
    const ref = this.dialog.open<ConfirmDialog, ConfirmDialogData, boolean>(ConfirmDialog, { data });
    return (await firstValueFrom(ref.afterClosed())) === true;
  }
}
