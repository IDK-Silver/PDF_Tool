//
// Created by idk on 2022/1/7.
//

#include "PDFUtils.h"

PDFUtils::PDFUtils() = default;

PDFUtils::~PDFUtils() = default;

void PDFUtils::get_pdf(const QString &input_path)
{
    this->pdf_input_path = input_path;
    std::shared_ptr<Poppler::Document> i(Poppler::Document::load(input_path));
    this->pdf_document = i;
}
