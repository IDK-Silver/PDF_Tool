#include "PDFView_Widget.h"
#include "ui_PDFView_Widget.h"

PDFView_Widget::PDFView_Widget(QWidget *parent) : QWidget(parent), ui(new Ui::PDFView_Widget)
{
	this->ui->setupUi(this);
}

PDFView_Widget::~PDFView_Widget()
{
}
