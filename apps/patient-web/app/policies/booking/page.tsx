import { SiteShell, Notice } from '@fisher/ui';
export default function BookingPolicy(){
 return <SiteShell subtitle="Booking policy" navigation={[{href:'/book',label:'Booking planner'}]}>
  <section className="fisher-section"><div className="fisher-container">
   <p className="fisher-eyebrow">Synthetic policy version synthetic-2026-10</p>
   <h1 className="fisher-section-title">Booking terms and consent</h1>
   <Notice title="Development environment only">These terms describe synthetic test workflows. They do not replace a reviewed production booking policy, patient privacy notice or legal consent document. Do not submit real medical or personal information.</Notice>
   <h2>Test selection and price</h2>
   <p>Prices are calculated in Nigerian naira (NGN) from the currently approved laboratory offering and selected Regular or Premium collection tier. A quotation is provisional and expires at the displayed deadline.</p>
   <h2>Collection and service coverage</h2>
   <p>Selecting a Lagos service zone does not prove an address is covered. Authenticated bookings require a separately approved patient relationship and collection address. A collection window is only temporarily held until the payment deadline.</p>
   <h2>Payment and confirmation</h2>
   <p>The staging checkout uses Paystack test credentials only. Returning from Paystack does not confirm payment. The backend verifies status, currency, amount and reference directly with the provider.</p>
   <h2>Cancellation, rescheduling and refunds</h2>
   <p>Unpaid bookings can be cancelled or rescheduled before checkout begins, subject to capacity and deadlines. Once payment has started, cancellation and refund requests require an audited support review. No automatic provider refund is offered in synthetic development.</p>
   <h2>Guest and family authority</h2>
   <p>Guest contact verification creates an assisted intake request, not a booking. Declaring someone a family member does not grant authority to book for them or view their results. Booking and result permissions are separately reviewed and revocable.</p>
   <h2>Messages and results</h2>
   <p>Booking status notifications contain no clinical payload and are restricted to explicitly approved synthetic inboxes. Laboratory results are governed by a separate release process and clinical access permissions.</p>
   <h2>Consent record</h2>
   <p>When you accept this synthetic policy, the server records its version and acknowledgment timestamp with your draft or guest-assisted request. It does not authorize a payment, clinical data disclosure or patient relationship.</p>
  </div></section>
 </SiteShell>;
}
