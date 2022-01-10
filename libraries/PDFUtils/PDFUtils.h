//
// Created by idk on 2022/1/7.
//

#ifndef PDF_TOOL_PDFUTILS_H
#define PDF_TOOL_PDFUTILS_H

#include <poppler/qt5/poppler-qt5.h>
#include <memory>
#include <QString>

class PDFUtils {
public :
    PDFUtils();
    ~PDFUtils();

    void get_pdf(const QString& input_path);
    

private:
    QString pdf_input_path;
    std::shared_ptr<Poppler::Document> pdf_document;
};


#endif //PDF_TOOL_PDFUTILS_H
