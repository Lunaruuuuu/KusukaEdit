// Kanvas tiruan: hanya HTML/CSS biasa, tidak bisa di-drag atau diedit.
export default function CanvasMock() {
  return (
    <div className="canvas-scroll">
      <div className="canvas-mock">
        <div className="mock-rect" />
        <div className="mock-circle" />
        <div className="mock-title">Add a title</div>
        <div className="mock-paragraph">
          Add a bit of body text here. Double click to edit.
        </div>
      </div>
    </div>
  );
}
