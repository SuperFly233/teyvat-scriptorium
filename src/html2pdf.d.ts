declare module 'html2pdf.js' {
  type Html2Pdf = {
    set(options: Record<string, unknown>): Html2Pdf
    from(element: HTMLElement): Html2Pdf
    save(filename?: string): Promise<void>
  }
  const html2pdf: () => Html2Pdf
  export default html2pdf
}
