# Use pdflatex
$pdf_mode = 1;
$pdflatex = 'pdflatex -interaction=nonstopmode -synctex=1 %O %S';

# Place all build artefacts in a local build/ directory
$out_dir = 'build';

# Clean up extra extensions on `latexmk -C`
$clean_ext = 'synctex.gz synctex.gz(busy) run.xml tex.bak bbl bcf fdb_latexmk run tdo %R-blx.bib';
